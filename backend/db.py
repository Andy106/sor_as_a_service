import os
from pathlib import Path
import motor.motor_asyncio
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set in .env")

client = motor.motor_asyncio.AsyncIOMotorClient(DATABASE_URL)
db = client["sor_db"]
