import uuid
from datetime import datetime
from sqlalchemy import String, Float, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from src.db.base import Base


class DisruptionModel(Base):
    __tablename__ = "disruptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    disruption_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    section_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    station_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    estimated_end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    speed_limit_kmh: Mapped[float] = mapped_column(Float, nullable=True)
    description: Mapped[str] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
