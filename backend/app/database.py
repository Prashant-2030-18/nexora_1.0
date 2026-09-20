from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import sys

# ============================================================
# DATABASE URL
# - Local development:  sqlite:///./data/ner-smartlogix.db  (default)
# - Production:         Set DATABASE_URL env var to postgresql://...
# NOTE: Render Free filesystem is ephemeral. Use Supabase PostgreSQL for production.
# ============================================================

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# Supabase and some hosting platforms use postgres:// instead of postgresql://
# SQLAlchemy 2.x requires the postgresql:// scheme for psycopg2.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

def _get_sqlite_url():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    db_path = os.path.join(data_dir, "ner-smartlogix.db")
    return f"sqlite:///{db_path}"

# Fall back to local SQLite if DATABASE_URL is not set
if not DATABASE_URL:
    DATABASE_URL = _get_sqlite_url()

# Configure the engine correctly for the dialect with startup resilience
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
else:
    # PostgreSQL (Supabase)
    if "supabase.co" in DATABASE_URL and "sslmode" not in DATABASE_URL:
        connect_args["sslmode"] = "require"
    try:
        engine = create_engine(
            DATABASE_URL,
            connect_args=connect_args,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
    except Exception as exc:
        print(f"[DATABASE WARNING] Failed to configure PostgreSQL engine: {exc}", file=sys.stderr)
        print("[DATABASE WARNING] Falling back to SQLite for service availability.", file=sys.stderr)
        DATABASE_URL = _get_sqlite_url()
        engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
