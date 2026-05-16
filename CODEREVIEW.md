# Code Review — SOR as a Service

**Reviewed:** 2026-05-16  
**Reviewer:** Claude (AI)  
**Scope:** Full codebase — backend (FastAPI/Python) and frontend (Next.js/TypeScript)

---

## Summary

The project is well-structured and faithfully implements the spec defined in `CLAUDE.md`. All four phases are complete and the overall architecture is clean. The primary concerns fall into three categories: **critical security gaps** (unauthenticated write paths), **operational risks** (no pagination, no indexes, no tests), and **maintainability issues** (code duplication, unused code, unpinned dependencies).

**Severity scale used below:** 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low

---

## Security

### 🔴 CRIT-01 — Authentication relies solely on an unauthenticated HTTP header

**File:** `backend/auth.py:5-9`, `backend/routers/schemas.py:14`, `backend/routers/assets.py:54`

```python
async def get_current_user(x_username: str = Header(...)):
    user = await db.users.find_one({"username": x_username})
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user
```

The `/login` endpoint validates credentials correctly, but the returned response contains no token or session identifier. All subsequent requests are authenticated purely by the value of the `X-Username` header — a value any caller can forge. Anyone who knows a valid username (which is disclosed on the login page — see SEC-05) can bypass authentication entirely and call any API endpoint as any user.

**Fix:** Issue a signed JWT or a server-side session cookie on successful login, and validate that credential on every protected request.

---

### 🟠 SEC-02 — No rate limiting on the `/login` endpoint

**File:** `backend/routers/login.py`

The login endpoint has no brute-force protection. An attacker can attempt unlimited password guesses without throttling, lockout, or CAPTCHA.

**Fix:** Add a rate-limiting middleware (e.g. `slowapi`) or place a reverse proxy (nginx, Cloudflare) with rate limits in front of the API.

---

### 🟠 SEC-03 — Session stored in `localStorage` is vulnerable to XSS

**Files:** `frontend/app/login/page.tsx:32-35`, `frontend/app/dashboard/page.tsx:17-22`, `frontend/app/schemas/page.tsx:33-38`, `frontend/app/assets/page.tsx:42-47`, `frontend/app/reports/page.tsx:51-56`

```typescript
localStorage.setItem("sor_user", JSON.stringify({
  username: data.username,
  asset_type: data.asset_type,
}));
```

Anything in `localStorage` is accessible to any JavaScript running on the page. If an XSS vulnerability is introduced (e.g. via a schema `title` field rendered without sanitization), an attacker can read the stored session and impersonate users.

**Fix:** If moving to real tokens, store them in `HttpOnly` cookies (not accessible to JavaScript). If localStorage must be used, ensure all user-supplied data rendered in the DOM is properly escaped.

---

### 🟠 SEC-04 — Schema body is stored without validation that it is a valid JSON Schema

**File:** `backend/routers/schemas.py:21-30`

```python
body = await request.json()
# ...
doc = {**body, "asset_type": asset_type, "version": new_version}
await db.schemas.insert_one(doc)
```

Any arbitrary JSON object can be saved as a schema. If an admin submits a malformed or malicious schema document, subsequent asset ingestion will silently fail validation or behave unexpectedly. There is no check that the submitted document is actually a valid JSON Schema draft.

**Fix:** Use `jsonschema.Draft7Validator.check_schema(body)` (or the appropriate draft) to validate the schema document before persisting it.

---

### 🟡 SEC-05 — Login page discloses all valid usernames

**File:** `frontend/app/login/page.tsx:64, 96-98`

```tsx
placeholder="e.g. admin_servers"
// ...
<p className="text-xs text-gray-400 mt-6 text-center">
  Default accounts: admin_servers · admin_storage · admin_databases · consumer
</p>
```

The login form explicitly lists all valid usernames. Combined with a weak/known default password (`password`), this gives an attacker everything needed to authenticate.

**Fix:** Remove the account hints from the login page. For a real deployment, change the default passwords or enforce password changes at first login.

---

### 🟡 SEC-06 — CORS configuration is hardcoded for localhost only

**File:** `backend/main.py:7-13`

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

The CORS origin is hardcoded to `http://localhost:3000`. Deploying without changing this will block all legitimate browser traffic from the production frontend. Additionally, `allow_methods=["*"]` and `allow_headers=["*"]` are overly broad.

**Fix:** Drive `allow_origins` from an environment variable. Restrict methods to `["GET", "POST"]` and headers to only those your API uses.

---

### 🟡 SEC-07 — No request size limit on bulk asset ingestion

**File:** `backend/routers/assets.py:61-77`

The `POST /assets/{asset_type}` endpoint accepts an unbounded JSON array. A caller can submit millions of records in a single request, causing memory exhaustion or DoS.

**Fix:** Add a maximum array length check immediately after parsing the body (e.g. raise 400 if `len(body) > 1000`). Also configure a global `max_body_size` limit in uvicorn.

---

## Backend

### 🟠 BE-01 — No pagination: entire collections loaded into memory

**Files:** `backend/routers/schemas.py:47`, `backend/routers/assets.py:117`

```python
schemas = await db.schemas.find({"asset_type": asset_type}).to_list(length=None)
records = await db[COLLECTION_MAP[asset_type]].find(query).to_list(length=None)
```

Both GET endpoints load every matching document into Python memory at once. With a large dataset this will cause high memory usage and eventually OOM crashes.

**Fix:** Accept `limit` and `skip` (or cursor-based) query parameters. Use `.limit()` and `.skip()` on the Motor cursor.

---

### 🟠 BE-02 — No database indexes defined

There are no index definitions anywhere in the codebase. The following queries execute full collection scans:

| Query | Collection | Missing Index |
|---|---|---|
| `find_one({"username": x_username})` | `users` | `username` (unique) |
| `find({"asset_type": asset_type})` | `schemas` | `asset_type` |
| `find_one({"asset_id": candidate})` | `assets_*` (×3) | `asset_id` (unique) |
| `find({"asset_type": ..., "asset_owner": ..., "asset_location": ...})` | `assets_*` | compound index |

**Fix:** Create indexes in a startup event or a dedicated migration script. At minimum:
```python
await db.users.create_index("username", unique=True)
await db.schemas.create_index("asset_type")
await db[col].create_index("asset_id", unique=True)  # for each asset collection
```

---

### 🟠 BE-03 — Unique ID generation has a check-then-act race condition

**File:** `backend/routers/assets.py:37-47`

```python
async def _generate_unique_id(prefix: str) -> str:
    while True:
        candidate = f"{prefix}-{uuid.uuid4()}"
        collision = False
        for col in COLLECTION_MAP.values():
            if await db[col].find_one({"asset_id": candidate}):
                collision = True
                break
        if not collision:
            return candidate
```

Two concurrent requests could both generate the same UUID, both check for collisions (finding none), and then both attempt to insert — causing a duplicate. UUID4 collisions are astronomically rare but the pattern is fragile and performs 3 round-trips to the database per ID.

**Fix:** Create a unique index on `asset_id` in each collection and catch `DuplicateKeyError` on insert rather than pre-checking. This eliminates the race and the extra queries.

---

### 🟡 BE-04 — Broad exception handling silently swallows errors

**Files:** `backend/routers/schemas.py:35-36`, `backend/routers/assets.py:95-96`

```python
except Exception:
    raise HTTPException(status_code=500, detail="Schema saving unsuccessful")
```

All exception details are discarded. A DB connection error, a schema conflict, or a programming bug all produce the same opaque 500. This makes debugging in production impossible.

**Fix:** At minimum, log the exception before re-raising:
```python
import logging
logger = logging.getLogger(__name__)

except Exception:
    logger.exception("Failed to insert schema")
    raise HTTPException(status_code=500, detail="Schema saving unsuccessful")
```

---

### 🟡 BE-05 — `seed.py` runs at module level, not inside a guard

**File:** `backend/seed.py:38`

```python
asyncio.run(seed())  # executes on import, not just on direct run
```

`seed_schemas.py` correctly uses `if __name__ == "__main__":`, but `seed.py` does not. Accidentally importing `seed` in a test or another module would run the seeding logic.

**Fix:** Wrap the call in the standard guard:
```python
if __name__ == "__main__":
    asyncio.run(seed())
```

---

### 🟡 BE-06 — Version comparison using `float` is fragile

**Files:** `backend/routers/schemas.py:25`, `backend/routers/assets.py:32`

```python
max_version = max(float(s["version"]) for s in existing)
```

Parsing versions as floats works only for the current `M.0` scheme. If any version ever uses a minor component (e.g. `1.10`), `float("1.10")` == `1.1`, causing incorrect ordering. Additionally, a non-numeric `version` value in the database would raise an unhandled `ValueError`.

**Fix:** Parse to `int` after splitting on `.` for the major component, or use the `packaging` library for proper version comparison.

---

### 🟡 BE-07 — Redundant `asset_type` filter in GET assets query

**File:** `backend/routers/assets.py:111-115`

```python
query: dict = {"asset_type": asset_type}
# ...
records = await db[COLLECTION_MAP[asset_type]].find(query).to_list(length=None)
```

The query already targets the collection specific to `asset_type` (`assets_servers`, `assets_storage`, etc.), so filtering by `asset_type` within that collection is redundant. Every record in `assets_servers` will have `asset_type == "servers"`.

**Fix:** Remove `asset_type` from the query dict. This also eliminates the need to store `asset_type` in individual records since it is already encoded in the collection name.

---

### 🔵 BE-08 — Dependencies are not version-pinned

**File:** `backend/requirements.txt`

```
fastapi
uvicorn[standard]
motor
python-dotenv
pydantic
passlib[bcrypt]
bcrypt
jsonschema
```

No versions are specified. This leads to non-reproducible builds — a future `pip install` could pull in a breaking major version.

**Fix:** Pin all dependencies (e.g. via `pip freeze > requirements.txt` after confirming a working install), or use a lockfile tool such as `pip-compile` (pip-tools).

---

### 🔵 BE-09 — `SchemaPostRequest` Pydantic model is defined but never used

**File:** `backend/models/schema.py`

```python
class SchemaPostRequest(BaseModel):
    schema_body: dict[str, Any]
```

This model is not imported or referenced anywhere. The schema router reads the raw request JSON directly (`await request.json()`).

**Fix:** Either delete the file or use the model in the router to get automatic request validation and OpenAPI documentation.

---

### 🔵 BE-10 — MongoDB session management in asset POST is overly verbose

**File:** `backend/routers/assets.py:88-96`

```python
session = await client.start_session()
try:
    async with session.start_transaction():
        await collection.insert_many(records, session=session)
finally:
    await session.end_session()
```

Motor provides `async with await client.start_session() as session:` as a context manager, which handles `end_session()` automatically and is the idiomatic approach.

**Fix:**
```python
async with await client.start_session() as session:
    async with session.start_transaction():
        await collection.insert_many(records, session=session)
```

---

## Frontend

### 🟠 FE-01 — Header/navigation is duplicated across all four pages

**Files:** `app/dashboard/page.tsx:34-68`, `app/schemas/page.tsx:104-143`, `app/assets/page.tsx:136-175`, `app/reports/page.tsx:136-173`

The complete `<header>` block (logo, nav links, user info, sign-out button) is copy-pasted into every page component. Any change to the navigation (e.g. adding a new route) requires updating four files.

**Fix:** Extract the header into a shared `components/AppHeader.tsx` component and import it in each page.

---

### 🟠 FE-02 — `JSON.parse` on stored session data is not guarded

**Files:** `app/dashboard/page.tsx:18-22`, `app/schemas/page.tsx:33-38`, `app/assets/page.tsx:42-47`, `app/reports/page.tsx:51-56`

```typescript
const stored = localStorage.getItem("sor_user");
if (!stored) { router.replace("/login"); return; }
setUser(JSON.parse(stored));  // throws if stored value is malformed JSON
```

If `localStorage` contains corrupted data (e.g. from a previous version of the app), `JSON.parse` will throw an unhandled exception in the `useEffect`, resulting in a broken page with no user-visible error.

**Fix:**
```typescript
try {
  setUser(JSON.parse(stored));
} catch {
  localStorage.removeItem("sor_user");
  router.replace("/login");
}
```

---

### 🟡 FE-03 — `NEXT_PUBLIC_API_URL` is not validated at startup

**Files:** All page files using `process.env.NEXT_PUBLIC_API_URL`

If the environment variable is not set, the fetch URL becomes `"undefined/login"`, `"undefined/schemas/servers"`, etc. This produces confusing network errors rather than a clear startup failure.

**Fix:** Add a check in `next.config.js` or a dedicated `env.ts` module that throws a descriptive error at build time if required env vars are missing.

---

### 🟡 FE-04 — `TYPE_COLORS` is defined but not fully utilised for chart fills

**File:** `frontend/app/reports/page.tsx:33-37, 262, 282, 300`

```typescript
const TYPE_COLORS: Record<string, string> = {
  servers: "#3b82f6",
  storage: "#10b981",
  databases: "#8b5cf6",
};
```

`TYPE_COLORS` is used for table row badges, but the three `BarChart` components hardcode the same hex values via `fill="#3b82f6"` etc. The values are duplicated and could drift out of sync.

**Fix:** Reference `TYPE_COLORS` in the chart `fill` props as well.

---

### 🟡 FE-05 — Content flash on protected pages before auth check completes

**Files:** All protected pages

```typescript
if (!user) return null;
```

On first render, `user` is always `null` (set asynchronously by the `useEffect`). The component returns `null` (blank page) until the effect runs. If the user is not authenticated, they'll also briefly see a blank page before the redirect. This is a poor user experience.

**Fix:** Add an explicit loading state to distinguish "checking auth" from "confirmed unauthenticated":
```typescript
const [authChecked, setAuthChecked] = useState(false);
// In useEffect: set authChecked = true after the check
if (!authChecked) return <LoadingSpinner />;
if (!user) return null; // redirect already fired
```

---

### 🟡 FE-06 — Logout logic is duplicated inline rather than extracted

**Files:** `app/schemas/page.tsx:134-138`, `app/assets/page.tsx:166-170`, `app/reports/page.tsx:164-168`

Three pages inline `localStorage.removeItem("sor_user"); router.push("/login");` directly in the onClick handler. `dashboard/page.tsx` at least extracts it into a `handleLogout` function.

**Fix:** Extract logout to a shared utility or into the proposed `AppHeader` component (see FE-01).

---

### 🔵 FE-07 — Non-null assertion operator used where null is possible

**Files:** `app/schemas/page.tsx:89`, `app/assets/page.tsx:103, 116`

```typescript
fetchSchemas(selectedType, user!.username);
// ...
body: JSON.stringify(parsed),
headers: { "X-Username": user!.username },
```

The `!` operator suppresses TypeScript's null check. While `user` is verified to exist via `canPost` or in the `if (!user) return null` guard before the form renders, TypeScript cannot trace this through closures — and if the code path ever changes, the runtime will throw `TypeError: Cannot read properties of null`.

**Fix:** Either guard with `if (!user) return;` at the start of each async handler, or use optional chaining `user?.username ?? ""`.

---

## Testing & Observability

### 🟠 TEST-01 — No automated tests exist

There are no unit tests, integration tests, or end-to-end tests in either the backend or the frontend. The only test utility is `backend/test_connection.py`, which only verifies DB connectivity.

**Recommendations:**
- **Backend:** Add pytest + `httpx` (ASGI test client) tests covering the happy path and error cases for each endpoint.
- **Frontend:** Add Vitest or Jest tests for key utility logic; Playwright or Cypress for E2E coverage of the login and asset ingestion flows.

---

### 🔵 OBS-01 — No structured logging or request tracing

The backend has no logging configuration. Errors are swallowed silently (see BE-04), and there is no request-ID or correlation header to trace a specific request through logs.

**Fix:** Add a logging configuration at startup and a middleware that injects a `X-Request-ID` header and logs method, path, status, and duration for every request.

---

### 🔵 OBS-02 — No `.env.example` file

There is no `.env.example` or documentation listing required environment variables. A new contributor has no guidance on what must be set before the app will start.

**Fix:** Add a `.env.example` at the repo root:
```
DATABASE_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Summary Table

| ID | Severity | Area | Issue |
|---|---|---|---|
| CRIT-01 | 🔴 Critical | Security | X-Username header forgery — no real authentication after login |
| SEC-02 | 🟠 High | Security | No rate limiting on login endpoint |
| SEC-03 | 🟠 High | Security | Session stored in XSS-accessible localStorage |
| SEC-04 | 🟠 High | Security | Schema POST accepts arbitrary JSON without schema validation |
| BE-01 | 🟠 High | Backend | No pagination — full collections loaded into memory |
| BE-02 | 🟠 High | Backend | No database indexes — all queries are full collection scans |
| BE-03 | 🟠 High | Backend | Race condition in unique ID generation |
| FE-01 | 🟠 High | Frontend | Header/nav duplicated across all four pages |
| FE-02 | 🟠 High | Frontend | `JSON.parse` on localStorage is unguarded |
| TEST-01 | 🟠 High | Testing | No automated tests |
| SEC-05 | 🟡 Medium | Security | Login page discloses all valid usernames |
| SEC-06 | 🟡 Medium | Security | CORS origin hardcoded to localhost |
| SEC-07 | 🟡 Medium | Security | No request size limit on bulk ingestion |
| BE-04 | 🟡 Medium | Backend | Silent exception swallowing — no logging |
| BE-05 | 🟡 Medium | Backend | `seed.py` runs at module level, not guarded |
| BE-06 | 🟡 Medium | Backend | Version comparison via `float` is fragile |
| BE-07 | 🟡 Medium | Backend | Redundant `asset_type` filter in asset GET query |
| FE-03 | 🟡 Medium | Frontend | `NEXT_PUBLIC_API_URL` not validated |
| FE-04 | 🟡 Medium | Frontend | `TYPE_COLORS` partially duplicated in chart fills |
| FE-05 | 🟡 Medium | Frontend | Content flash before auth check completes |
| FE-06 | 🟡 Medium | Frontend | Logout logic duplicated inline |
| BE-08 | 🔵 Low | Backend | Dependencies not version-pinned |
| BE-09 | 🔵 Low | Backend | Unused `SchemaPostRequest` model |
| BE-10 | 🔵 Low | Backend | Verbose MongoDB session management |
| FE-07 | 🔵 Low | Frontend | Non-null assertions where null is possible |
| OBS-01 | 🔵 Low | Observability | No structured logging |
| OBS-02 | 🔵 Low | Observability | No `.env.example` file |
