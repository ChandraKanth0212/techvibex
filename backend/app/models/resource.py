from datetime import datetime
import uuid
from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.database import Base


class ResourceModel(Base):
    __tablename__ = "resources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    resource_code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # HEAVY_MACHINERY, TOWER_WAGON, CREW_GANG
    department: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    location: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="AVAILABLE", index=True)
    total_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    available_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Source Tracking
    source_system: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source_record_id: Mapped[str] = mapped_column(String(100), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
