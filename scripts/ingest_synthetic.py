import asyncio
import sys
import os

# Add workspace root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import init_db, AsyncSessionLocal
from backend.app.services.data_service import DataHubService


async def main():
    print("Initializing RailOpt Module 1 Database...")
    await init_db()
    print("Seeding synthetic data into PostgreSQL/SQLite...")
    async with AsyncSessionLocal() as session:
        result = await DataHubService.seed_synthetic_data_if_empty(session)
        print("Data Seeding Completed:")
        for entity, count in result.items():
            print(f" - {entity}: {count} records")


if __name__ == "__main__":
    asyncio.run(main())
