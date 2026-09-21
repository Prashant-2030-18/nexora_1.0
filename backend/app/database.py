import os
import sys
import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# ============================================================
# DATABASE URL
# - Local development:  sqlite:///./data/ner-smartlogix.db  (default)
# - Production:         Set DATABASE_URL env var to postgresql://...
# NOTE: Render Free filesystem is ephemeral. Use Supabase PostgreSQL for production.
# ============================================================

def _get_sqlite_url():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    db_path = os.path.join(data_dir, "ner-smartlogix.db")
    return f"sqlite:///{db_path}"

def sanitize_database_url(raw_url: str) -> str:
    """
    Safely parse and re-encode DATABASE_URL:
    - Normalizes postgres:// to postgresql://
    - Robustly handles special characters in password (like @, #, $, %, !)
    - Prevents password fragments from corrupting the hostname
    - Never prints or exposes raw credentials
    """
    url = raw_url.strip()
    if not url:
        return ""
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    if not url.startswith("postgresql://"):
        return url

    # Extract user:password and host part cleanly
    prefix, _, rest = url.partition("://")
    if "@" not in rest:
        return url

    # rpartition to isolate the actual host:port/dbname from user:pass
    user_pass, _, host_part = rest.rpartition("@")
    if ":" in user_pass:
        user, _, passwd = user_pass.partition(":")
        # Decode first if already partially escaped, then quote safely
        safe_pass = urllib.parse.quote_plus(urllib.parse.unquote_plus(passwd))
        return f"{prefix}://{user}:{safe_pass}@{host_part}"
    
    return url

_raw_db_url = os.getenv("DATABASE_URL", "").strip()
DATABASE_URL = sanitize_database_url(_raw_db_url)

IS_PRODUCTION = os.getenv("ENVIRONMENT", "").lower() == "production"

# Fall back to local SQLite if DATABASE_URL is not set
if not DATABASE_URL:
    if IS_PRODUCTION:
        print("[DATABASE WARNING] DATABASE_URL not set in production! Render filesystem is ephemeral.", file=sys.stderr)
    DATABASE_URL = _get_sqlite_url()

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
else:
    # PostgreSQL (Supabase / Render)
    # Ensure SSL mode is enabled for Supabase
    if "supabase" in DATABASE_URL and "sslmode" not in DATABASE_URL:
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
        print(f"[DATABASE ERROR] Failed to create PostgreSQL engine: {type(exc).__name__}", file=sys.stderr)
        if not IS_PRODUCTION:
            print("[DATABASE WARNING] Falling back to SQLite for local development.", file=sys.stderr)
            DATABASE_URL = _get_sqlite_url()
            engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
        else:
            raise

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
