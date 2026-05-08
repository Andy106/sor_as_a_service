# System of Record (SOR) as a Service

## Progress Summary (as of 2026-05-08)

- **Phase 1** — COMPLETE. Backend and frontend tested and working.
- **Phase 2** — COMPLETE. Backend and frontend tested and working.
- **Phase 3** — COMPLETE. Backend and frontend tested and working.
- **Phase 4** — COMPLETE. Frontend built; awaiting manual testing.

### Phase 4 Implementation Notes
- `frontend/app/reports/page.tsx` — three dropdowns (Asset Type, Asset Owner, Asset Location); Owner/Location options are derived dynamically from the loaded data.
- Selecting "All Types" fires parallel GET requests against all three asset collections and merges results; selecting a specific type fires one request. Owner/Location filtering is applied client-side for instant response.
- Three recharts `BarChart` panels: Count by Asset Type (blue), Count by Asset Owner (green), Count by Asset Location (purple). Charts only render when there are records.
- Asset records table below charts with scrollable rows; Asset Type shown as a colour-coded badge.
- `recharts` added to `frontend/package.json` (`npm install recharts` already run).
- Nav updated on Dashboard, Schemas, and Assets pages to include Reports link.

### Phase 3 Implementation Notes
- `backend/routers/assets.py` — `POST /assets/{asset_type}` (validate + insert) and `GET /assets/{asset_type}` (with optional `asset_owner` / `asset_location` query filters).
- `jsonschema` added to `requirements.txt`. Run `pip install -r requirements.txt` to pick it up.
- POST flow: auth check → fetch latest schema → auto-inject `asset_type` → validate all records → generate UUIDs (`SRV-*`, `STR-*`, `DB-*`, unique across all three collections) → write via MongoDB transaction (all-or-nothing). Returns 400 on any validation or write failure.
- `frontend/app/assets/page.tsx` — asset-type tabs; left panel = submit form (admin of matching type only, amber notice otherwise); right panel = searchable asset list with `asset_owner` / `asset_location` filters.
- Nav updated on Dashboard and Schemas pages to include Assets link.

### Phase 2 Implementation Notes
- `backend/routers/schemas.py` — `POST /schemas/{asset_type}` and `GET /schemas/{asset_type}`.
- Auth uses `X-Username` header (from `auth.py`); `verify_asset_type_access` enforces role — returns 403 `Insufficient entitlements` for cross-type or consumer POST.
- Version auto-increments: no prior schema → `1.0`; prior exists → `max + 1.0` (e.g. `2.0`).
- `backend/seed_schemas.py` — seeds default schemas for servers, storage, databases into `sor_db.schemas`. Run once: `python seed_schemas.py` from `backend/`.
- `frontend/app/schemas/page.tsx` — asset-type tabs; left panel shows all versions (sorted newest first); right panel shows Add form (admin of matching type only) or amber auth notice.
- Dashboard header updated with nav link to Schemas.

### Phase 1 Implementation Notes
- `backend/` — FastAPI app; `db.py` connects to MongoDB Atlas via `DATABASE_URL` in root `.env`.
- `backend/seed.py` — seeds 4 users into `sor_db.users` collection with bcrypt-hashed passwords.
- `POST /login` — validates credentials, returns `{message, username, asset_type}` (200) or 401.
- `frontend/` — Next.js 16 app with Tailwind. Root `/` redirects to `/login`. On success, stores `{username, asset_type}` in `localStorage` and redirects to `/dashboard`.
- Run backend: `uvicorn main:app --reload --port 8000` (from `backend/`).
- Run frontend: `npm run dev` (from `frontend/`).

---

## Phase 1 - Implement Feature 1 - Login Module ✅ COMPLETE

- Create a database collection to store Login Details. Create 4 default records with usernames set to 'admin_servers', 'admin_storage', 'admin_databases', 'consumer' and password for all of them set to 'password'.
- Build the /login POST endpoint to accept and validate the Username and Password against the Login details available within the database collection. If successful, it should respond with a 200 status code and a 'Login Successful' message. If failed, it should respond with a 401 status code and 'Login Failed' error message.
- Build the Frontend login form.

## Phase 2 - Implement Feature 2 - Schema Module

- Create a appropriate database collection to store schema Details. 
- Create default, intuitive schemas for the 3 Asset Types - Servers, Storage, Databases. All the schemas must have the following common, mandatory attributes - asset_type, asset_owner, asset_location. All the other attributes must be optional.
- Create the /schemas/{asset_type} POST endpoint to accept and persist custom schemas in the schema database collection. The provided schema must have the asset_type attribute added to it based upon the parameter provided. It should also add a version attribute with the value '1.0'. Respond with a 200 status code and 'Schema Saved' mesage if successful. If failed, it should respond with a 500 status code and 'Schema saving unsuccessful' error message.
- If a new schema gets POSTED for an Asset Type, for which a schema already existed previously, the version of the new schema must be by 1 Major Version higher than the maximum Version of the already persisted schemas for that Asset Type. So, for instance, if for Asset Type Servers, a schema with Version 1.0 existed in the database collection already, perist the new schema with Version set to 2.0.
- Also create /schemas/{asset_type} GET endpoint to retrieve the relevant persisted schemas' Details. 
- Build the Frontend form to Add Schemas based on Schema's Asset Type. Also create a field to display the already added Schemas, based on the Schema's Asset Type
- NOTE: Only the admin user for the relevant Asset Type must be able to POST Schemas for the said Asset Type e.g.- 'admin_servers' can add schemas belonging to the Asset Type - Servers.GET endoints should be open to all the 4 users. Return a 403 status code with message 'Insufficient entitlements' if an admin user tries to post schemas for a non-matching Asset Type.

## Phase 3 - Implement Feature 3 - Data Ingestion Module

- Create the appropriate database collections to store Asset Records. Create different collections for the different Asset Types - Servers, Storage and Databases.
- Create the /assets/{asset_type} POST endpoint to accept and persist multiple Asset Records at a time belonging the Asset Type in the appropriate database collection based upon the parameter provided. This endpoint should validate the asset records against the latest version of Asset Type schema and if found valid, persist the data in the appropriate database collection. Please follow an all-or-nothing approach - either save all the asset records provided in the payload or none. The Asset Identifier must be generated automatically and added to the Asset Records by the endpoint before persistence. The Asset Identifier must be unique across the entire system, not just within its specific collection. Respond with a 200 status code, Generated Asset Identifiers and 'Asset Records Saved' message if successful. If failed (including schema validation failures), it should respond with a 400 status code and 'Asset Records saving unsuccessful' error message.
- Also create /assets/{asset_type} GET endpoint to retrieve all the persisted Asset Records. This endpoint should support query filters for the Asset Owner, Asset Location
- Build the Frontend form with a Drop Down to select the Asset Type. For the Selected Asset Type, provide a field to submit multiple Asset Records at a time in a JSON format.
- NOTE: Only the admin user for the relevant Asset Type must be able to add Asset Records for the said Asset Type e.g.- 'admin_servers' can add Asset Records belonging to the Asset Type - Servers. GET endoints should be open to all the 4 users. Return a 403 status code with message 'Insufficient entitlements' if an admin user tries to post asset records for a non-matching Asset Type.

## Phase 4 - Implement Feature 4 - Reporting Module

- Leverage the GET endpoints created in Phase 3 amd build the Frontend with Drop Downs to select the Asset Type AND / OR Asset Owner AND / OR Asset Location. For the selected filters display the Asset Records.
- Also provide an appropriate chart visualization wherein the Data Consumers / Asset Type Data Publisher are able to visualize Count of Assets by the selected Asset Type, Asset Owner, Asset Location.
- NOTE - All the 4 users should be able to query data across all the 3 Asset Types