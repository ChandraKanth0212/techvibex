from datetime import datetime
import uuid
from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.database import Base


class GoodsForecastModel(Base):
    __tablename__ = "goods_forecasts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    forecast_code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    origin_hub: Mapped[str] = mapped_column(String(150), nullable=False)
    destination_hub: Mapped[str] = mapped_column(String(150), nullable=False)
    corridor_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    estimated_departure: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    estimated_arrival: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    cargo_type: Mapped[str] = mapped_column(String(100), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="FORECASTED", index=True)

    # Source Tracking
    source_system: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source_record_id: Mapped[str] = mapped_column(String(100), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
