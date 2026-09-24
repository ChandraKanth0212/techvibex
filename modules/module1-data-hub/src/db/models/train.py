import uuid
from sqlalchemy import String, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from src.db.base import Base


class TrainModel(Base):
    __tablename__ = "trains"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    train_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    train_name: Mapped[str] = mapped_column(String(100), nullable=False)
    train_type: Mapped[str] = mapped_column(String(20), default="PASSENGER")
    priority: Mapped[str] = mapped_column(String(20), default="PRIORITY_2")
    length_meters: Mapped[float] = mapped_column(Float, default=650.0)
    max_speed_kmh: Mapped[float] = mapped_column(Float, default=130.0)
    hauling_loco_type: Mapped[str] = mapped_column(String(50), default="WAP-7")
