"""Initial database migration for RailOpt Module 1

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-09-24

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Corridors table
    op.create_table(
        'corridors',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('corridor_code', sa.String(length=100), nullable=False, unique=True, index=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('start_station', sa.String(length=100), nullable=False),
        sa.Column('end_station', sa.String(length=100), nullable=False),
        sa.Column('total_length_km', sa.Float(), nullable=False),
        sa.Column('tracks_count', sa.Integer(), nullable=False, server_default='2'),
        sa.Column('electrified', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('status', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_system', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_record_id', sa.String(length=100), nullable=False),
        sa.Column('ingested_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    # Assets table
    op.create_table(
        'assets',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('asset_code', sa.String(length=100), nullable=False, unique=True, index=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('asset_type', sa.String(length=50), nullable=False, index=True),
        sa.Column('location', sa.String(length=255), nullable=False),
        sa.Column('line_section', sa.String(length=255), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, index=True),
        sa.Column('department', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_system', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_record_id', sa.String(length=100), nullable=False),
        sa.Column('ingested_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    # Maintenance Tasks table
    op.create_table(
        'maintenance_tasks',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('task_code', sa.String(length=100), nullable=False, unique=True, index=True),
        sa.Column('department', sa.String(length=50), nullable=False, index=True),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('asset_id', sa.String(length=36), nullable=True, index=True),
        sa.Column('corridor_id', sa.String(length=36), nullable=False, index=True),
        sa.Column('status', sa.String(length=50), nullable=False, index=True),
        sa.Column('priority', sa.String(length=50), nullable=False, index=True),
        sa.Column('estimated_duration_minutes', sa.Integer(), nullable=False),
        sa.Column('start_time_window', sa.DateTime(), nullable=True),
        sa.Column('end_time_window', sa.DateTime(), nullable=True),
        sa.Column('required_resources', sa.JSON(), nullable=True),
        sa.Column('source_system', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_record_id', sa.String(length=100), nullable=False),
        sa.Column('ingested_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    # Defects table
    op.create_table(
        'defects',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('defect_code', sa.String(length=100), nullable=False, unique=True, index=True),
        sa.Column('asset_id', sa.String(length=36), nullable=False, index=True),
        sa.Column('department', sa.String(length=50), nullable=False, index=True),
        sa.Column('severity', sa.String(length=50), nullable=False, index=True),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, index=True),
        sa.Column('reported_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('source_system', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_record_id', sa.String(length=100), nullable=False),
        sa.Column('ingested_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    # Block Requests table
    op.create_table(
        'block_requests',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('request_code', sa.String(length=100), nullable=False, unique=True, index=True),
        sa.Column('department', sa.String(length=50), nullable=False, index=True),
        sa.Column('corridor_id', sa.String(length=36), nullable=False, index=True),
        sa.Column('asset_ids', sa.JSON(), nullable=True),
        sa.Column('requested_start_time', sa.DateTime(), nullable=False),
        sa.Column('requested_end_time', sa.DateTime(), nullable=False),
        sa.Column('min_duration_minutes', sa.Integer(), nullable=False),
        sa.Column('flexible', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('status', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_system', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_record_id', sa.String(length=100), nullable=False),
        sa.Column('ingested_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    # Trains table
    op.create_table(
        'trains',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('train_number', sa.String(length=50), nullable=False, unique=True, index=True),
        sa.Column('train_name', sa.String(length=200), nullable=False),
        sa.Column('train_type', sa.String(length=50), nullable=False, index=True),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('origin', sa.String(length=100), nullable=False),
        sa.Column('destination', sa.String(length=100), nullable=False),
        sa.Column('scheduled_departure', sa.DateTime(), nullable=False),
        sa.Column('scheduled_arrival', sa.DateTime(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_system', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_record_id', sa.String(length=100), nullable=False),
        sa.Column('ingested_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    # Goods Forecasts table
    op.create_table(
        'goods_forecasts',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('forecast_code', sa.String(length=100), nullable=False, unique=True, index=True),
        sa.Column('origin_hub', sa.String(length=150), nullable=False),
        sa.Column('destination_hub', sa.String(length=150), nullable=False),
        sa.Column('corridor_id', sa.String(length=36), nullable=False, index=True),
        sa.Column('estimated_departure', sa.DateTime(), nullable=False),
        sa.Column('estimated_arrival', sa.DateTime(), nullable=False),
        sa.Column('cargo_type', sa.String(length=100), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('status', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_system', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_record_id', sa.String(length=100), nullable=False),
        sa.Column('ingested_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )

    # Resources table
    op.create_table(
        'resources',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('resource_code', sa.String(length=100), nullable=False, unique=True, index=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('resource_type', sa.String(length=50), nullable=False, index=True),
        sa.Column('department', sa.String(length=50), nullable=False, index=True),
        sa.Column('location', sa.String(length=200), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, index=True),
        sa.Column('total_quantity', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('available_quantity', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('source_system', sa.String(length=50), nullable=False, index=True),
        sa.Column('source_record_id', sa.String(length=100), nullable=False),
        sa.Column('ingested_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False)
    )


def downgrade() -> None:
    op.drop_table('resources')
    op.drop_table('goods_forecasts')
    op.drop_table('trains')
    op.drop_table('block_requests')
    op.drop_table('defects')
    op.drop_table('maintenance_tasks')
    op.drop_table('assets')
    op.drop_table('corridors')
