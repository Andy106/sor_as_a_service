from fastapi import APIRouter, Depends, HTTPException, Request
from auth import get_current_user, verify_asset_type_access
from db import db

router = APIRouter(prefix="/schemas", tags=["schemas"])

VALID_ASSET_TYPES = {"servers", "storage", "databases"}


@router.post("/{asset_type}")
async def create_schema(
    asset_type: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    if asset_type not in VALID_ASSET_TYPES:
        raise HTTPException(status_code=400, detail="Invalid asset type")

    verify_asset_type_access(current_user, asset_type)

    body = await request.json()

    existing = await db.schemas.find({"asset_type": asset_type}).to_list(length=None)
    if existing:
        max_version = max(float(s["version"]) for s in existing)
        new_version = f"{int(max_version + 1.0)}.0"
    else:
        new_version = "1.0"

    doc = {**body, "asset_type": asset_type, "version": new_version}

    try:
        await db.schemas.insert_one(doc)
        return {"message": "Schema Saved"}
    except Exception:
        raise HTTPException(status_code=500, detail="Schema saving unsuccessful")


@router.get("/{asset_type}")
async def get_schemas(
    asset_type: str,
    current_user: dict = Depends(get_current_user),
):
    if asset_type not in VALID_ASSET_TYPES:
        raise HTTPException(status_code=400, detail="Invalid asset type")

    schemas = await db.schemas.find({"asset_type": asset_type}).to_list(length=None)
    for s in schemas:
        s["_id"] = str(s["_id"])
    return schemas
