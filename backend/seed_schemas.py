"""Seed default schemas for all three asset types into sor_db.schemas."""
import asyncio
from db import db

DEFAULT_SCHEMAS = [
    {
        "asset_type": "servers",
        "version": "1.0",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Server Asset",
        "type": "object",
        "required": ["asset_type", "asset_owner", "asset_location"],
        "properties": {
            "asset_type": {"type": "string"},
            "asset_owner": {"type": "string", "description": "Team or individual owning this server"},
            "asset_location": {"type": "string", "description": "Data centre or cloud region"},
            "hostname": {"type": "string"},
            "ip_address": {"type": "string"},
            "os": {"type": "string"},
            "cpu_cores": {"type": "integer"},
            "ram_gb": {"type": "number"},
            "storage_gb": {"type": "number"},
            "environment": {"type": "string", "enum": ["production", "staging", "development", "dr"]},
            "status": {"type": "string", "enum": ["active", "decommissioned", "maintenance"]},
        },
        "additionalProperties": True,
    },
    {
        "asset_type": "storage",
        "version": "1.0",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Storage Asset",
        "type": "object",
        "required": ["asset_type", "asset_owner", "asset_location"],
        "properties": {
            "asset_type": {"type": "string"},
            "asset_owner": {"type": "string"},
            "asset_location": {"type": "string"},
            "storage_type": {"type": "string", "enum": ["SAN", "NAS", "Object", "Block", "File"]},
            "capacity_tb": {"type": "number"},
            "vendor": {"type": "string"},
            "model": {"type": "string"},
            "protocol": {"type": "string"},
            "environment": {"type": "string", "enum": ["production", "staging", "development", "dr"]},
            "status": {"type": "string", "enum": ["active", "decommissioned", "maintenance"]},
        },
        "additionalProperties": True,
    },
    {
        "asset_type": "databases",
        "version": "1.0",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Database Asset",
        "type": "object",
        "required": ["asset_type", "asset_owner", "asset_location"],
        "properties": {
            "asset_type": {"type": "string"},
            "asset_owner": {"type": "string"},
            "asset_location": {"type": "string"},
            "db_engine": {
                "type": "string",
                "enum": ["MySQL", "PostgreSQL", "MongoDB", "Oracle", "MSSQL", "Redis", "Cassandra"],
            },
            "db_version": {"type": "string"},
            "host": {"type": "string"},
            "port": {"type": "integer"},
            "instance_name": {"type": "string"},
            "environment": {"type": "string", "enum": ["production", "staging", "development", "dr"]},
            "status": {"type": "string", "enum": ["active", "decommissioned", "maintenance"]},
        },
        "additionalProperties": True,
    },
]


async def seed():
    for schema in DEFAULT_SCHEMAS:
        existing = await db.schemas.find_one(
            {"asset_type": schema["asset_type"], "version": schema["version"]}
        )
        if existing:
            print(f"Schema for {schema['asset_type']} v{schema['version']} already exists — skipping.")
        else:
            await db.schemas.insert_one(schema)
            print(f"Seeded schema for {schema['asset_type']} v{schema['version']}.")


if __name__ == "__main__":
    asyncio.run(seed())
