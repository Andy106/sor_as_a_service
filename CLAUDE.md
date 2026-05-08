# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**System of Record (SOR) as a Service** — a master data management application for infrastructure assets (Servers, Storage, Databases). Each asset type has a dedicated admin publisher with role-based access control, JSON Schema-driven validation, bulk ingestion, and reporting with chart visualization.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (React) |
| Backend | Python FastAPI |
| Database | MongoDB Atlas |
| Env config | `.env` at repo root (contains `DATABASE_URL`) |

## Intended Project Structure

```
sor_as_a_service/
├── backend/           # FastAPI app
│   ├── main.py
│   ├── routers/       # login.py, schemas.py, assets.py
│   ├── models/        # Pydantic models
│   ├── db.py          # MongoDB connection (motor or pymongo)
│   └── requirements.txt
├── frontend/          # Next.js app (created via `npx create-next-app`)
│   ├── pages/ or app/
│   └── package.json
└── .env               # DATABASE_URL for MongoDB Atlas
```

## Development Commands

### Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev        # dev server on port 3000
npm run build
npm run lint
```

## Implementation Plan

### Phase 1 — Login Module
- MongoDB collection `users` with 4 default records: `admin_servers`, `admin_storage`, `admin_databases`, `consumer` — all with password `password`.
- `POST /login` — validates credentials; returns 200 `Login Successful` or 401 `Login Failed`.
- Frontend: login form page.

### Phase 2 — Schema Module
- MongoDB collection `schemas`.
- Default schemas for all 3 asset types. All schemas require common mandatory fields: `asset_type`, `asset_owner`, `asset_location`; all other fields optional.
- `POST /schemas/{asset_type}` — persists custom schema; auto-injects `asset_type` field and `version` (starts at `1.0`, increments by 1 major version if prior schema exists for that type). Returns 200 `Schema Saved` or 500 `Schema saving unsuccessful`.
- `GET /schemas/{asset_type}` — retrieves persisted schemas for the type.
- Authorization: only `admin_<asset_type>` may POST schemas for their type. Other admins attempting a cross-type POST receive 403 `Insufficient entitlements`. All 4 users may call GET.
- Frontend: form to add/view schemas per asset type.

### Phase 3 — Data Ingestion Module
- Separate MongoDB collections per asset type: `assets_servers`, `assets_storage`, `assets_databases`.
- `POST /assets/{asset_type}` — accepts an array of records, validates all against the **latest version** of the asset type's schema. All-or-nothing: save all or none. Auto-generates unique Asset Identifiers (unique across all collections). Returns 200 with generated IDs and `Asset Records Saved`, or 400 `Asset Records saving unsuccessful` on any failure.
- `GET /assets/{asset_type}` — retrieves records with optional query filters `asset_owner` and `asset_location`.
- Authorization: same pattern as Phase 2 — only `admin_<asset_type>` may POST; all 4 users may GET.
- Frontend: dropdown to select asset type, JSON textarea for bulk record submission.

### Phase 4 — Reporting Module
- Frontend page with dropdowns for Asset Type, Asset Owner, Asset Location.
- Displays filtered asset records in a table.
- Chart visualization (e.g., bar chart) showing count of assets grouped by the selected filters.
- All 4 users can query across all 3 asset types.

## Key Business Rules

- Asset Identifier is **system-wide unique** — generate as a UUID or prefixed sequence, checked across all three asset collections before insertion.
- Schema versioning uses **major versions only** (`1.0`, `2.0`, `3.0` …). The next version = `max(existing versions) + 1.0`.
- Validation uses the **latest version** of the schema for an asset type.
- The `consumer` user has read-only access (GET endpoints only, no POST to schemas or assets).
- The `admin_*` users are restricted to their own asset type for write operations.
