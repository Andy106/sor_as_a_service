# Code Review — SOR as a Service

**Reviewed:** Full codebase (backend + frontend)  
**Date:** 2026-05-16  
**Reviewer:** Claude Code

---

## Overview

SOR as a Service is a master data management application for infrastructure assets (Servers, Storage, Databases). The stack is Python FastAPI + MongoDB (via Motor) on the backend and Next.js (TypeScript, Tailwind, Recharts) on the frontend. The implementation covers login, schema versioning, bulk asset ingestion with JSON Schema validation, and a reporting dashboard with bar charts.

The code is clean and well-structured for a proof-of-concept. Role-based access control is enforced server-side, MongoDB transactions are used correctly for all-or-nothing writes, and the frontend uses `useMemo`/`useCallback` appropriately. The main concerns below fall into three categories: **critical security**, **correctness**, and **quality/maintainability**.

---

## Critical Security Issues

### 1. Authentication is trivially bypassable (`auth.py:5`)

```python
async def get_current_user(x_username: str = Header(...)):
    user = await db.users.find_one({"username": x_username})
```

The backend trusts a plain `X-Username` HTTP header supplied by the client. Any user — or attacker — can set `X-Username: admin_servers` in a request and gain full write access to server schemas and assets. There is no session token, no JWT, and no signature verification. This is the most severe issue in the project.

**Fix:** Issue a signed token (e.g. a JWT with a secret) at login and require it as a `Bearer` token on subsequent requests. The login endpoint already verifies bcrypt passwords — it just needs to return a token rather than relying on the client to re-send its own username.

### 2. `localStorage` auth state is untrusted client data (`app/login/page.tsx`)

```typescript
localStorage.setItem("sor_user", JSON.stringify(data));
```

Storing the authenticated user object in `localStorage` and then forwarding it as an `X-Username` header is the frontend half of the same problem. Any JavaScript running on the page (e.g. via XSS) can read or overwrite it. It is also visible to all scripts on the same origin with no expiry.

**Fix:** Use an `httpOnly` cookie to carry the session token. The cookie would be set by the backend at login and is invisible to JavaScript.

### 3. No CSRF protection

`allow_credentials=True` in CORS configuration combined with cookie-based auth (if adopted above) requires CSRF mitigations. Even without cookies, the current design relies on the browser not sending the `X-Username` header in cross-origin requests, which CORS enforces — but only partially. Document this risk if cookies are adopted.

---

## Correctness Issues

### 4. MongoDB session not used as a context manager (`assets.py:88–94`)

```python
session = await client.start_session()
try:
    async with session.start_transaction():
        await collection.insert_many(records, session=session)
finally:
    await session.end_session()
```

If `start_session()` itself raises (e.g. network error), `session` is never assigned and `end_session()` in `finally` will raise `UnboundLocalError`, masking the original exception. The Motor idiomatic pattern is:

```python
async with await client.start_session() as session:
    async with session.start_transaction():
        await collection.insert_many(records, session=session)
```

### 5. `localStorage.getItem` parsed without try/catch (all page components)

```typescript
setUser(JSON.parse(stored));
```

If the stored value is malformed (e.g. truncated during a write), `JSON.parse` throws an uncaught exception inside `useEffect`, producing an unhandled error. Wrap in `try/catch` and fall back to `router.replace("/login")`.

### 6. Failed GET responses silently drop errors (`schemas/page.tsx:44–53`, `assets/page.tsx:59–66`)

```typescript
const res = await fetch(...);
if (res.ok) setSchemas(await res.json());
// non-ok responses are silently ignored
```

A 401, 403, or 500 from the server leaves the UI showing stale or empty data with no feedback. Check `res.ok` and surface the error to the user.

### 7. `consumer` user GET access not enforced at the API level

The `GET /assets/{asset_type}` and `GET /schemas/{asset_type}` endpoints only call `get_current_user` (authentication), not `verify_asset_type_access` (authorisation). This matches the spec — all 4 users may call GET. However, this means a `consumer` can read all asset types, which is correct per the requirements. Confirm this is intentional, and add a comment so future developers do not accidentally add the authorisation check.

### 8. Version arithmetic is fragile (`schemas.py:26`)

```python
new_version = f"{int(max_version + 1.0)}.0"
```

`float("1.0") + 1.0 = 2.0` and `int(2.0) = 2`, so this works for now. But floating-point arithmetic on version strings is a code smell. Use integer math instead:

```python
new_version = f"{int(float(max_version)) + 1}.0"
```

Or store `version` as a plain integer in MongoDB and format it only on output.

---

## Quality and Maintainability Issues

### 9. `VALID_ASSET_TYPES` duplicated in two routers

Both `routers/schemas.py` and `routers/assets.py` define the same set:

```python
VALID_ASSET_TYPES = {"servers", "storage", "databases"}
```

Move this (and `COLLECTION_MAP`, `PREFIX_MAP`) to a shared `constants.py` module to avoid drift if asset types ever change.

### 10. No pagination on listing endpoints

```python
records = await db[COLLECTION_MAP[asset_type]].find(query).to_list(length=None)
```

`length=None` fetches every document in the collection into memory in a single round-trip. With thousands of assets this will cause high memory usage and slow responses. Add `skip`/`limit` query parameters and a reasonable default page size (e.g. 100).

The reports page compounds this by fetching all three collections on every type-filter change (`Promise.all` over all ASSET_TYPES).

### 11. No MongoDB indexes defined

No unique index is declared on `asset_id`, and no index exists on `username` in the `users` collection or `asset_type` in `schemas`. At scale, every `find_one({"username": x})` is a full collection scan. Add indexes in a migration script or via seed scripts:

```python
await db.users.create_index("username", unique=True)
await db.schemas.create_index([("asset_type", 1), ("version", 1)])
await db[col].create_index("asset_id", unique=True)
```

A unique index on `asset_id` would also replace the bespoke collision-detection loop in `_generate_unique_id` — just catch `DuplicateKeyError` on insert.

### 12. Schema body is not validated as a JSON Schema

`POST /schemas/{asset_type}` accepts any JSON object and stores it verbatim. A user could submit `{"hello": "world"}`, which would later fail silently during asset validation in a confusing way. Consider using `jsonschema.Draft7Validator.check_schema(body)` to reject structurally invalid schemas at save time.

### 13. Navigation header is copy-pasted across four pages

`dashboard/page.tsx`, `schemas/page.tsx`, `assets/page.tsx`, and `reports/page.tsx` all contain an identical `<header>` block (~30 lines). Extract it to `app/components/AppHeader.tsx` to keep DRY.

### 14. `user!.username` non-null assertions are unsafe

```typescript
headers: { "X-Username": user!.username },
```

These appear after a `!user` guard, but TypeScript's non-null assertion bypasses the type checker at runtime if the guard logic ever changes. Prefer optional chaining with an early return:

```typescript
if (!user) return;
```

### 15. CORS is hardcoded to `localhost:3000` (`main.py:9`)

```python
allow_origins=["http://localhost:3000"],
```

This is a development-only configuration. Read the allowed origin(s) from an environment variable so staging/production deployments do not require code changes.

### 16. Seed scripts run at module import time (`seed.py:38`)

```python
asyncio.run(seed())
```

This means importing `seed.py` in any context (e.g. a test file) immediately runs the database seeding. Wrap the call in an `if __name__ == "__main__":` guard.

### 17. No request size limit on POST bodies

FastAPI has no default body size cap. A malicious client could POST a multi-megabyte JSON array to `/assets/{asset_type}` and cause memory pressure. Add a size check:

```python
body = await request.json()
if len(body) > MAX_BATCH_SIZE:
    raise HTTPException(status_code=413, detail="Batch too large")
```

Or configure an ASGI middleware limit.

---

## Positive Observations

- **Clean layered architecture**: `auth.py`, `db.py`, `models/`, `routers/` are well-separated. Adding a new asset type requires changes in only two places.
- **All-or-nothing transactions**: The MongoDB transaction in `create_assets` correctly ensures partial writes never occur.
- **Validation before write**: All records are validated against the latest schema before any IDs are generated or any DB writes are attempted. The fail-fast pattern is correct.
- **`useMemo` / `useCallback`**: The reports page derives all chart data and filter options via memoised computations — no redundant recalculation on unrelated re-renders.
- **TypeScript throughout**: The frontend uses strict TypeScript; shared types like `AssetRecord` and `SorUser` are defined at the top of each file.
- **Informative UI feedback**: Loading states, permission warnings, and inline error messages are consistently surfaced across all pages.
- **bcrypt password hashing**: Passwords are hashed with bcrypt in `seed.py` and verified via `passlib` — correct use of the primitive.

---

## Summary of Recommendations (Priority Order)

| Priority | Issue | File(s) |
|----------|-------|---------|
| Critical | Replace `X-Username` header auth with JWT Bearer tokens | `auth.py`, `login.py`, all frontend pages |
| Critical | Use `httpOnly` cookie for session token instead of `localStorage` | `app/login/page.tsx` |
| High | Fix Motor session context manager | `routers/assets.py:88` |
| High | Add `try/catch` around `JSON.parse(stored)` | All page components |
| High | Surface non-ok GET responses to the user | `schemas/page.tsx`, `assets/page.tsx` |
| High | Add MongoDB indexes (`username`, `asset_id`, `asset_type`) | `seed.py` or a new `migrate.py` |
| Medium | Add pagination to list endpoints | `routers/schemas.py`, `routers/assets.py` |
| Medium | Validate submitted body is a valid JSON Schema | `routers/schemas.py` |
| Medium | Extract shared nav header component | `app/components/AppHeader.tsx` |
| Medium | Move `VALID_ASSET_TYPES` / maps to `constants.py` | `routers/schemas.py`, `routers/assets.py` |
| Medium | Read CORS origin from environment variable | `main.py` |
| Low | Guard seed scripts with `if __name__ == "__main__"` | `seed.py`, `seed_schemas.py` |
| Low | Add request body size limit | `routers/assets.py` |
| Low | Use integer version arithmetic | `routers/schemas.py:26` |
