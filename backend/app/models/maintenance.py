from datetime import datetime
import uuid
from typing import Optional, List
from sqlalchemy import String, Integer, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.database import Base


class MaintenanceTaskModel(Base):
    __tablename__ = "maintenance_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    department: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    corridor_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="PLANNED", index=True)
    priority: Mapped[str] = mapped_column(String(50), nullable=False, default="MEDIUM", index=True)
    estimated_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time_window: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    end_time_window: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    required_resources: Mapped[Optional[list]] = mapped_column(JSON, default=list, nullable=True)

    # Source Tracking
    source_system: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source_record_id: Mapped[str] = mapped_column(String(100), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
