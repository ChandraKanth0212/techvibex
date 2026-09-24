import uuid
from sqlalchemy import String, Integer, Boolean, Float, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry
from src.db.base import Base


class StationModel(Base):
    __tablename__ = "stations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    location = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    total_platforms: Mapped[int] = mapped_column(Integer, default=10)
    loop_lines_count: Mapped[int] = mapped_column(Integer, default=4)
    is_junction: Mapped[bool] = mapped_column(Boolean, default=False)
    extra_metadata: Mapped[dict] = mapped_column(JSON, nullable=True)
