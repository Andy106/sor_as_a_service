"""Run with: python test_connection.py"""
import asyncio
import os
from pathlib import Path
import motor.motor_asyncio
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
DATABASE_URL = os.getenv("DATABASE_URL")


async def main():
    print(f"Connecting to MongoDB...")
    client = motor.motor_asyncio.AsyncIOMotorClient(DATABASE_URL)
    try:
        await client.admin.command("ping")
        print("MongoDB connection successful.")
    except Exception as e:
        print(f"MongoDB connection FAILED: {e}")
    finally:
        client.close()


asyncio.run(main())
