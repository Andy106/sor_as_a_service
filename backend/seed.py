"""Run with: python seed.py — seeds default users if not already present."""
import asyncio
import os
from pathlib import Path
import motor.motor_asyncio
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
DATABASE_URL = os.getenv("DATABASE_URL")

client = motor.motor_asyncio.AsyncIOMotorClient(DATABASE_URL)
db = client["sor_db"]
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEFAULT_USERS = [
    {"username": "admin_servers",   "asset_type": "servers"},
    {"username": "admin_storage",   "asset_type": "storage"},
    {"username": "admin_databases", "asset_type": "databases"},
    {"username": "consumer",        "asset_type": None},
]


async def seed():
    password_hash = pwd_context.hash("password")
    inserted = 0
    for user in DEFAULT_USERS:
        existing = await db.users.find_one({"username": user["username"]})
        if not existing:
            await db.users.insert_one({**user, "password": password_hash})
            inserted += 1
            print(f"  Created user: {user['username']}")
        else:
            print(f"  Already exists: {user['username']}")
    print(f"Seed complete. {inserted} new user(s) created.")


asyncio.run(seed())
