"""Structured HTTP error handling for the API.

Every failure is rendered as the stable :class:`~app.schemas.api.ErrorResponse`
envelope with the shape::

    {
      "error": {
        "code": "...",
        "message": "...",
        "details": {...},
        "request_id": "..." | null,
      }
    }

The envelope is *produced* from that DTO, so the OpenAPI contract and the wire
format can never drift apart.

No Python tracebacks or internal implementation details are ever exposed:

- :class:`ApiError` carries an explicit HTTP status code (raised by routes);
- FastAPI/Pydantic request-validation problems become ``422
  REQUEST_VALIDATION`` with a sanitised ``details.errors`` list;
- unmatched routes and unsupported methods keep their status code with a
  ``NOT_FOUND`` / ``METHOD_NOT_ALLOWED`` code;
- unexpected exceptions become a generic ``500 INTERNAL_ERROR``.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.api import ErrorDetailDTO, ErrorResponse

logger = logging.getLogger("railopt.api")

ERROR_CODES_BY_STATUS = {
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    403: "FORBIDDEN",
    409: "CONFLICT",
}

#: Human-readable summary per status code, used to document the envelope in the
#: generated OpenAPI document. The machine-readable truth stays ``error.code``.
ERROR_STATUS_DESCRIPTIONS = {
    400: (
        "The request was rejected before any optimization ran: the planning "
        "context is empty, the task scope is empty or references a task absent "
        "from the context, the block request is missing/ambiguous, or candidate "
        "generation / integrated-block detection failed."
    ),
    404: "No plan with the requested plan_id exists in the in-memory plan store.",
    409: (
        "The stored plan does not carry the requested view: it has no metrics or "
        "no validation result. Regenerate the plan."
    ),
    422: (
        "The request body failed validation. `details.errors` carries a sanitised "
        "`loc` / `type` / `msg` list; no traceback or internal detail is exposed."
    ),
    500: "An unexpected internal error occurred. No traceback is exposed.",
}

#: Status codes every pipeline route can answer with, as an OpenAPI fragment.
ALL_ERROR_STATUSES = (400, 404, 409, 422, 500)


def error_responses(*status_codes: int) -> dict[int | str, dict[str, Any]]:
    """OpenAPI ``responses=`` fragment documenting the error envelope.

    Declaring the envelope on every route (and overriding FastAPI's default
    ``422``) is what keeps ``/openapi.json`` honest: Module 4 sees the same
    shape the API actually returns, not FastAPI's default validation model.
    """
    return {
        status_code: {
            "model": ErrorResponse,
            "description": ERROR_STATUS_DESCRIPTIONS[status_code],
        }
        for status_code in status_codes
    }


class ApiError(Exception):
    """Structured, transport-level failure carrying an HTTP status code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
        request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}
        self.request_id = request_id


def _header_request_id(request: Request) -> str | None:
    value = request.headers.get("x-request-id")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


async def _body_request_id(request: Request) -> str | None:
    try:
        body = await request.body()
        if not body:
            return None
        payload = json.loads(body)
    except (RuntimeError, UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    value = payload.get("request_id")
    if value is None and isinstance(payload.get("request"), dict):
        value = payload["request"].get("request_id")
    if value is None or isinstance(value, (dict, list)):
        return None
    text = str(value).strip()
    return text or None


async def _request_id(request: Request, explicit: str | None = None) -> str | None:
    return explicit or _header_request_id(request) or await _body_request_id(request)


def error_body(
    code: str,
    message: str,
    details: dict | None = None,
    request_id: str | None = None,
) -> dict:
    """Render the stable error envelope from the published DTO.

    Values are passed through untouched (``mode="python"``) so the payload is
    exactly what the DTO declares, and the response is serialised by
    :class:`JSONResponse` as before.
    """
    return ErrorResponse(
        error=ErrorDetailDTO(
            code=code,
            message=message,
            details=details or {},
            request_id=request_id,
        )
    ).model_dump(mode="python")


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(
            exc.code,
            exc.message,
            exc.details,
            await _request_id(request, exc.request_id),
        ),
    )


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors = []
    for entry in exc.errors():
        clean = {"loc": list(entry.get("loc", [])), "type": entry.get("type", "")}
        if isinstance(entry.get("msg"), str):
            clean["msg"] = entry["msg"]
        errors.append(clean)
    return JSONResponse(
        status_code=422,
        content=error_body(
            "REQUEST_VALIDATION",
            "request body failed validation",
            {"errors": errors},
            await _request_id(request),
        ),
    )


async def http_error_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    code = ERROR_CODES_BY_STATUS.get(exc.status_code, f"HTTP_{exc.status_code}")
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(
            code,
            detail or "request failed",
            request_id=await _request_id(request),
        ),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled API error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content=error_body(
            "INTERNAL_ERROR",
            "an unexpected internal error occurred",
            {"path": request.url.path},
            await _request_id(request),
        ),
    )


def install_exception_handlers(app: FastAPI) -> None:
    """Install every structured error handler on the application."""
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)


__all__ = [
    "ALL_ERROR_STATUSES",
    "ApiError",
    "ERROR_CODES_BY_STATUS",
    "ERROR_STATUS_DESCRIPTIONS",
    "error_body",
    "error_responses",
    "install_exception_handlers",
]