"""
Ensure SQLite schema matches current SQLAlchemy models.
create_all() does not ALTER existing tables — this migrates safely.
"""
from sqlalchemy import text, inspect
from app.database import engine, SessionLocal


def column_exists(table: str, column: str) -> bool:
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns(table)]
    return column in cols


def table_exists(table: str) -> bool:
    return table in inspect(engine).get_table_names()


def migrate():
    with engine.begin() as conn:
        # disaster_alerts new columns
        if table_exists("disaster_alerts"):
            alters = [
                ("source", "ALTER TABLE disaster_alerts ADD COLUMN source VARCHAR(50) DEFAULT 'SACHET_NDMA'"),
                ("source_type", "ALTER TABLE disaster_alerts ADD COLUMN source_type VARCHAR(50) DEFAULT 'OFFICIAL'"),
                ("verification_status", "ALTER TABLE disaster_alerts ADD COLUMN verification_status VARCHAR(50) DEFAULT 'VERIFIED'"),
            ]
            for col, sql in alters:
                if not column_exists("disaster_alerts", col):
                    print(f"[MIGRATE] Adding disaster_alerts.{col}")
                    conn.execute(text(sql))

        # Ensure sachet_etag_cache exists (create_all handles new tables)
        from app.models import Base
        Base.metadata.create_all(bind=engine)
        print("[MIGRATE] Schema migration complete.")


if __name__ == "__main__":
    migrate()
