import uuid
from sqlalchemy import String, Integer, Boolean, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry
from src.db.base import Base


class TrackSectionModel(Base):
    __tablename__ = "track_sections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    section_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    source_station_code: Mapped[str] = mapped_column(String(10), ForeignKey("stations.code"), nullable=False)
    target_station_code: Mapped[str] = mapped_column(String(10), ForeignKey("stations.code"), nullable=False)
    length_km: Mapped[float] = mapped_column(Float, nullable=False)
    max_speed_kmh: Mapped[float] = mapped_column(Float, default=130.0)
    track_count: Mapped[int] = mapped_column(Integer, default=2)
    gradient_per_thousand: Mapped[float] = mapped_column(Float, default=0.0)
    path = mapped_column(Geometry("LINESTRING", srid=4326), nullable=True)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
