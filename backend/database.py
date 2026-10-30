"""
Database Configuration & ORM Models for OjaPulse.
Defaults to local SQLite (`data/naijaprice.db`) for local development,
and switches to PostgreSQL when `DATABASE_URL` is configured.
"""

import os
from datetime import datetime
from pathlib import Path
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    create_engine,
    Index,
)
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SQLITE_PATH = BASE_DIR / "data" / "naijaprice.db"

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}")

# Render PostgreSQL URLs sometimes start with postgres:// instead of postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

Base = declarative_base()


class MarketModel(Base):
    __tablename__ = "markets"

    market_id = Column(String(50), primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    state = Column(String(60), nullable=False, index=True)
    city = Column(String(80), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    market_type = Column(String(120), nullable=False)
    market_days = Column(String(100), nullable=False)
    transport_tier = Column(String(80), nullable=False)
    base_multiplier = Column(Float, default=1.0)


class HistoricalPriceModel(Base):
    __tablename__ = "historical_prices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String(20), nullable=False, index=True)
    country = Column(String(50), default="Nigeria")
    region = Column(String(60), nullable=False, index=True)
    market_id = Column(String(50), nullable=False, index=True)
    market_name = Column(String(120), nullable=False)
    product_id = Column(String(50), nullable=False, index=True)
    product_name = Column(String(80), nullable=False)
    category = Column(String(80), nullable=False)
    base_unit = Column(String(40), nullable=False)
    open_price = Column(Float, nullable=False)
    high_price = Column(Float, nullable=False)
    low_price = Column(Float, nullable=False)
    close_price = Column(Float, nullable=False)
    currency = Column(String(10), default="NGN")

    __table_args__ = (
        Index("ix_hist_market_product_date", "market_id", "product_id", "date"),
    )


class PriceSubmissionModel(Base):
    __tablename__ = "price_submissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    submission_code = Column(String(40), unique=True, index=True)
    observation_date = Column(String(20), nullable=False, index=True)
    state = Column(String(60), nullable=False, index=True)
    market_id = Column(String(50), nullable=False, index=True)
    market_name = Column(String(120), nullable=False)
    product_id = Column(String(50), nullable=False, index=True)
    product_name = Column(String(80), nullable=False)
    unit_name = Column(String(60), nullable=False)
    kg_equivalent = Column(Float, nullable=False)
    submitted_price_ngn = Column(Float, nullable=False)
    normalized_price_per_kg = Column(Float, nullable=False)
    expected_benchmark_per_kg = Column(Float, nullable=False)
    deviation_pct = Column(Float, nullable=False)
    reporter_name = Column(String(100), default="Local Trader")
    reporter_role = Column(String(60), default="Retailer")
    verification_status = Column(String(30), nullable=False, index=True)  # 'verified' or 'flagged'
    is_anomaly = Column(Boolean, default=False)
    anomaly_reason = Column(Text, default="None")
    confidence_score = Column(Float, default=0.95)
    created_at = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
