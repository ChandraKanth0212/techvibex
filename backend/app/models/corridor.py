from datetime import datetime
import uuid
from sqlalchemy import String, Float, Integer, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.database import Base


class CorridorModel(Base):
    __tablename__ = "corridors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    corridor_code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    start_station: Mapped[str] = mapped_column(String(100), nullable=False)
    end_station: Mapped[str] = mapped_column(String(100), nullable=False)
    total_length_km: Mapped[float] = mapped_column(Float, nullable=False)
    tracks_count: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    electrified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="OPERATIONAL", index=True)

    # Source Tracking
    source_system: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source_record_id: Mapped[str] = mapped_column(String(100), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
