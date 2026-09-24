from datetime import datetime
import uuid
from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.database import Base


class TrainModel(Base):
    __tablename__ = "trains"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    train_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    train_name: Mapped[str] = mapped_column(String(200), nullable=False)
    train_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # VANDE_BHARAT, RAJDHANI, EXPRESS, FREIGHT
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    origin: Mapped[str] = mapped_column(String(100), nullable=False)
    destination: Mapped[str] = mapped_column(String(100), nullable=False)
    scheduled_departure: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    scheduled_arrival: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="ON_TIME", index=True)

    # Source Tracking
    source_system: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source_record_id: Mapped[str] = mapped_column(String(100), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
