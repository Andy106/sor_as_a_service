from fastapi import Header, HTTPException
from db import db


async def get_current_user(x_username: str = Header(...)):
    user = await db.users.find_one({"username": x_username})
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


def verify_asset_type_access(user: dict, asset_type: str):
    if user.get("asset_type") != asset_type:
        raise HTTPException(status_code=403, detail="Insufficient entitlements")
