import uuid
from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.db.base import Base


class ScheduleMasterModel(Base):
    __tablename__ = "schedule_masters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    train_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trains.id"), nullable=False)
    train_number: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    origin_station_code: Mapped[str] = mapped_column(String(10), nullable=False)
    destination_station_code: Mapped[str] = mapped_column(String(10), nullable=False)

    stops = relationship("ScheduleStopModel", back_populates="schedule", cascade="all, delete-orphan", order_by="ScheduleStopModel.stop_sequence")


class ScheduleStopModel(Base):
    __tablename__ = "schedule_stops"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    schedule_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schedule_masters.id"), nullable=False)
    station_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("stations.id"), nullable=False)
    station_code: Mapped[str] = mapped_column(String(10), nullable=False)
    stop_sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    scheduled_arrival: Mapped[str] = mapped_column(String(20), nullable=True)
    scheduled_departure: Mapped[str] = mapped_column(String(20), nullable=True)
    scheduled_halt_minutes: Mapped[int] = mapped_column(Integer, default=0)
    platform_number: Mapped[int] = mapped_column(Integer, nullable=True)

    schedule = relationship("ScheduleMasterModel", back_populates="stops")
