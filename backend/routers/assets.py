from fastapi import APIRouter, Depends, HTTPException, Request, Query
from typing import Optional
import uuid
import jsonschema

from auth import get_current_user, verify_asset_type_access
from db import db, client

router = APIRouter(prefix="/assets", tags=["assets"])

VALID_ASSET_TYPES = {"servers", "storage", "databases"}

COLLECTION_MAP = {
    "servers": "assets_servers",
    "storage": "assets_storage",
    "databases": "assets_databases",
}

PREFIX_MAP = {
    "servers": "SRV",
    "storage": "STR",
    "databases": "DB",
}


async def _get_latest_schema(asset_type: str) -> dict:
    schemas = await db.schemas.find({"asset_type": asset_type}).to_list(length=None)
    if not schemas:
        raise HTTPException(
            status_code=400, detail="Asset Records saving unsuccessful"
        )
    latest = max(schemas, key=lambda s: float(s["version"]))
    # Strip MongoDB/SOR metadata — pass only JSON Schema keywords to validator
    return {k: v for k, v in latest.items() if k not in ("_id", "asset_type", "version")}


async def _generate_unique_id(prefix: str) -> str:
    """Generate a UUID-based asset ID guaranteed unique across all three collections."""
    while True:
        candidate = f"{prefix}-{uuid.uuid4()}"
        collision = False
        for col in COLLECTION_MAP.values():
            if await db[col].find_one({"asset_id": candidate}):
                collision = True
                break
        if not collision:
            return candidate


@router.post("/{asset_type}")
async def create_assets(
    asset_type: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    if asset_type not in VALID_ASSET_TYPES:
        raise HTTPException(status_code=400, detail="Invalid asset type")

    verify_asset_type_access(current_user, asset_type)

    body = await request.json()
    if not isinstance(body, list) or len(body) == 0:
        raise HTTPException(status_code=400, detail="Asset Records saving unsuccessful")

    schema = await _get_latest_schema(asset_type)

    # Inject asset_type and validate every record before touching the DB
    records = []
    for raw in body:
        if not isinstance(raw, dict):
            raise HTTPException(status_code=400, detail="Asset Records saving unsuccessful")
        record = {**raw, "asset_type": asset_type}
        try:
            jsonschema.validate(instance=record, schema=schema)
        except jsonschema.ValidationError:
            raise HTTPException(status_code=400, detail="Asset Records saving unsuccessful")
        records.append(record)

    # Generate system-wide unique IDs
    prefix = PREFIX_MAP[asset_type]
    for record in records:
        record["asset_id"] = await _generate_unique_id(prefix)

    generated_ids = [r["asset_id"] for r in records]
    collection = db[COLLECTION_MAP[asset_type]]

    # All-or-nothing write via a MongoDB transaction (Atlas replica set)
    try:
        session = await client.start_session()
        try:
            async with session.start_transaction():
                await collection.insert_many(records, session=session)
        finally:
            await session.end_session()
    except Exception:
        raise HTTPException(status_code=400, detail="Asset Records saving unsuccessful")

    return {"message": "Asset Records Saved", "asset_ids": generated_ids}


@router.get("/{asset_type}")
async def get_assets(
    asset_type: str,
    asset_owner: Optional[str] = Query(None),
    asset_location: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    if asset_type not in VALID_ASSET_TYPES:
        raise HTTPException(status_code=400, detail="Invalid asset type")

    query: dict = {"asset_type": asset_type}
    if asset_owner:
        query["asset_owner"] = asset_owner
    if asset_location:
        query["asset_location"] = asset_location

    records = await db[COLLECTION_MAP[asset_type]].find(query).to_list(length=None)
    for r in records:
        r["_id"] = str(r["_id"])
    return records
