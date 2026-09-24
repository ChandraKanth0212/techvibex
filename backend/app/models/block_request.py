from datetime import datetime
import uuid
from typing import Optional, List
from sqlalchemy import String, Integer, Boolean, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.database import Base


class BlockRequestModel(Base):
    __tablename__ = "block_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    request_code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    department: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    corridor_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    asset_ids: Mapped[Optional[list]] = mapped_column(JSON, default=list, nullable=True)
    requested_start_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    requested_end_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    min_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    flexible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="SUBMITTED", index=True)

    # Source Tracking
    source_system: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source_record_id: Mapped[str] = mapped_column(String(100), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
