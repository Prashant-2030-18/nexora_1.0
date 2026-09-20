from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# ============================================================
# DATABASE URL
# - Local development:  sqlite:///./data/ner-smartlogix.db  (default)
# - Production:         Set DATABASE_URL env var to postgresql://...
# NOTE: Render Free filesystem is ephemeral. Use Supabase PostgreSQL for production.
# ============================================================

DATABASE_URL = os.getenv("DATABASE_URL", "")

# Supabase and some hosting platforms use postgres:// instead of postgresql://
# SQLAlchemy 2.x requires the postgresql:// scheme for psycopg2.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Fall back to local SQLite if DATABASE_URL is not set
if not DATABASE_URL:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    DATA_DIR = os.path.join(BASE_DIR, "data")
    os.makedirs(DATA_DIR, exist_ok=True)
    DB_PATH = os.path.join(DATA_DIR, "ner-smartlogix.db")
    DATABASE_URL = f"sqlite:///{DB_PATH}"

# Configure the engine correctly for the dialect
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    # PostgreSQL — no connect_args needed for psycopg2
    # pool_pre_ping ensures stale connections from Render/Supabase pool resets are handled
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
