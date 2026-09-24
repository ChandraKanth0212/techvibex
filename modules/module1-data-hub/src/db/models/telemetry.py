import uuid
from datetime import datetime
from sqlalchemy import String, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from geoalchemy2 import Geometry
from src.db.base import Base


class LiveTelemetryModel(Base):
    __tablename__ = "live_telemetry"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    train_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trains.id"), nullable=False, index=True)
    train_number: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    location = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    speed_kmh: Mapped[float] = mapped_column(Float, default=0.0)
    heading: Mapped[float] = mapped_column(Float, default=0.0)
    current_section_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    distance_in_section_km: Mapped[float] = mapped_column(Float, default=0.0)
    delay_minutes: Mapped[float] = mapped_column(Float, default=0.0)
    current_signal_aspect: Mapped[str] = mapped_column(String(20), default="GREEN")


class ActiveTrainStateModel(Base):
    __tablename__ = "active_train_states"

    train_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trains.id"), primary_key=True)
    train_number: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    current_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    current_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    speed_kmh: Mapped[float] = mapped_column(Float, default=0.0)
    current_section_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    accumulated_delay_minutes: Mapped[float] = mapped_column(Float, default=0.0)
    last_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
