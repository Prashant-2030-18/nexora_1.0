"""
Safe cleanup migration — remove demo/fake entities without touching official SACHET,
genuine user reports, administrative closures, or verified logistics hubs.

Usage:
  cd backend
  python cleanup_demo_data.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import SessionLocal, engine, Base
from app.models import Vehicle, Shipment, GPSLocation, DisasterAlert
from sqlalchemy import text

DEMO_ALERT_PREFIXES = ("DEMO-", "FAKE-", "SAMPLE-", "TEST-HOSPITAL")
DEMO_VEHICLE_MARKERS = ("DEMO", "SAMPLE", "FAKE", "TEST-VEH")


def run_cleanup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    removed = {"vehicles": 0, "shipments": 0, "gps": 0, "fake_alerts": 0}
    try:
        # Remove clearly labelled demo vehicles / shipments / GPS trails
        for v in db.query(Vehicle).all():
            num = (v.vehicle_number or "").upper()
            loc = (v.current_location or "").upper()
            if any(m in num or m in loc for m in DEMO_VEHICLE_MARKERS):
                db.query(GPSLocation).filter(GPSLocation.vehicle_id == v.id).delete()
                db.query(Shipment).filter(Shipment.vehicle_id == v.id).delete()
                db.delete(v)
                removed["vehicles"] += 1

        for s in db.query(Shipment).all():
            sn = (s.shipment_number or "").upper()
            if any(m in sn for m in DEMO_VEHICLE_MARKERS):
                db.delete(s)
                removed["shipments"] += 1

        # Remove fake disaster alerts that use demo identifiers — never touch real SACHET IDs
        for a in db.query(DisasterAlert).all():
            ident = (a.identifier or "").upper()
            if any(ident.startswith(p) for p in DEMO_ALERT_PREFIXES):
                db.delete(a)
                removed["fake_alerts"] += 1

        # Drop orphan hospital-like demo tables if any legacy migration created them
        for table in ("demo_hospitals", "sample_clinics", "fake_traffic"):
            try:
                db.execute(text(f"DROP TABLE IF EXISTS {table}"))
            except Exception:
                pass

        db.commit()
        print("Cleanup complete (official SACHET / user reports / hubs preserved):")
        for k, v in removed.items():
            print(f"  - {k}: {v}")
        print("Honest empty states remain where no real data exists.")
    except Exception as e:
        db.rollback()
        print(f"Cleanup failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run_cleanup()
