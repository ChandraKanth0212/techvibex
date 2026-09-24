from datetime import datetime
import uuid
from sqlalchemy import String, Float, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.database import Base


class AssetModel(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    asset_code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # TRACK, SIGNAL, SWITCH, OHE, etc.
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    line_section: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=True)
    longitude: Mapped[float] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="OPERATIONAL", index=True)
    department: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # ENGINEERING, SIGNAL_TELECOMMUNICATION, TRACTION

    # Source Tracking
    source_system: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source_record_id: Mapped[str] = mapped_column(String(100), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
