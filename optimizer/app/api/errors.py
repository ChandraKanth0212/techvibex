"""Structured HTTP error handling for the Phase 7A API.

Every failure is rendered as a JSON envelope with the shape::

    {"error": {"code": "...", "message": "...", "details": {...}}}

No Python tracebacks or internal implementation details are ever exposed:

- :class:`ApiError` carries an explicit HTTP status code (raised by routes);
- FastAPI/Pydantic request-validation problems become ``422
  REQUEST_VALIDATION`` with a sanitised ``details.errors`` list;
- unmatched routes and unsupported methods keep their status code with a
  ``NOT_FOUND`` / ``METHOD_NOT_ALLOWED`` code;
- unexpected exceptions become a generic ``500 INTERNAL_ERROR``.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("railopt.api")

ERROR_CODES_BY_STATUS = {
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    403: "FORBIDDEN",
    409: "CONFLICT",
}


class ApiError(Exception):
    """Structured, transport-level failure carrying an HTTP status code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


def error_body(code: str, message: str, details: dict | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or {}}}


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(exc.code, exc.message, exc.details),
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
        ),
    )


async def http_error_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    code = ERROR_CODES_BY_STATUS.get(exc.status_code, f"HTTP_{exc.status_code}")
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(code, detail or "request failed"),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled API error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content=error_body(
            "INTERNAL_ERROR",
            "an unexpected internal error occurred",
            {"path": request.url.path},
        ),
    )


def install_exception_handlers(app: FastAPI) -> None:
    """Install every structured error handler on the application."""
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)


__all__ = [
    "ApiError",
    "ERROR_CODES_BY_STATUS",
    "error_body",
    "install_exception_handlers",
]