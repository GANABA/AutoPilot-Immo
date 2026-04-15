"""Seed script — import sample_properties.csv into the database."""
import sys
from pathlib import Path

# Make sure app package is importable
sys.path.insert(0, str(Path(__file__).parent))

from app.database.connection import SessionLocal
from app.database.models import Tenant
from app.ingestion.csv_importer import import_properties_from_csv

CSV_PATH = Path(__file__).parent.parent / "data" / "sample_properties.csv"


def main():
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter_by(slug="immoplus").first()
        if not tenant:
            print("ERROR: Tenant 'immoplus' not found. Run the app first to create it.")
            return

        content = CSV_PATH.read_text(encoding="utf-8")
        result = import_properties_from_csv(db, content, tenant.id)
        print(f"Done — imported: {result.imported}, skipped: {result.skipped}, errors: {len(result.errors)}")
        if result.errors:
            for e in result.errors:
                print(f"  {e}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
