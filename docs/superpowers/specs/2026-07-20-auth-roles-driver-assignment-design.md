# Auth, Roles & Driver Assignment — Design Spec

*Supersedes `2026-07-06-auth-roles-driver-assignment-design.md`, which targeted a pre-libsql architecture (separate better-sqlite3 process, JWT) that was never built. This spec targets the current codebase: Express + `@libsql/client`, deployed as a single Vercel serverless function (`api/[...path].ts`).*

## Problem

RouteWay Intelligence has no real authentication. `LoginMockup` accepts any input and any signed-in user gets the full desktop app, including the Driver Portal's route picker (any vehicle's route, no restriction). There's no concept of a driver account distinct from the admin/planner using the app.

## Goal

One **admin** account can manage many **driver** accounts. Each driver logs in and sees only their own assigned route (turn-by-turn navigation + mark-delivered), enforced server-side, not just hidden in the UI.

Single company / single tenant — one shared fleet and driver pool, no multi-tenant isolation.

## Architecture

- Session strategy: **DB-backed sessions**, not JWT. The app runs as a stateless serverless function with no shared memory between invocations, so an in-memory session store is not viable; a `sessions` table in the existing libsql DB is checked on every request — the same round-trip pattern already used for `/api/fleet` and `/api/plan`.
- Passwords hashed with `bcryptjs` (pure JS — no native build step, safe for Vercel's build environment).
- No change to VRP computation (`src/lib/algorithms.ts`, `geo.ts`) or the 8 algorithm variants — this feature only touches auth, fleet (driver assignment column), and plan/progress access control.

## Data Model (libsql, added to `server/db.ts`)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'driver')),
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

ALTER TABLE vehicles ADD COLUMN driver_user_id TEXT REFERENCES users(id);
```

Seed on boot: if `users` is empty, insert one admin — username `admin`, password `admin123` (hashed). This is a placeholder credential; changing it post-deploy is the operator's responsibility (documented in README, not enforced by the app).

## Auth & Roles

Endpoints (`server/routes/auth.ts`):
- `POST /api/auth/login` — `{ username, password }` → verifies bcrypt hash, creates a session row, sets httpOnly cookie `sid` (7-day expiry)
- `POST /api/auth/logout` — deletes the session row, clears cookie
- `GET /api/auth/me` — resolves cookie → session → user, returns `{ id, username, role, displayName }` or 401

Middleware (`server/middleware/auth.ts`):
- `requireAuth` — 401 if no valid session
- `requireRole('admin')` — 403 if session user isn't admin

Route guards:
- Admin-only: `PUT /api/fleet`, all of `/api/drivers/*`, `POST /api/plan`
- Driver-reachable: `GET /api/plan/my-route` (new — returns only their assigned route), `POST /api/plan/progress` (server rejects a `routeIndex` that isn't theirs)
- `GET /api/fleet`, `GET /api/plan/active`, `GET /api/plan/progress` stay admin-only (unchanged full-fleet view); drivers use the new scoped `my-route` endpoint instead

Driver management (`server/routes/drivers.ts`, admin-only):
- `GET /api/drivers` — list driver accounts + their assigned vehicle (if any)
- `POST /api/drivers` — create `{ username, password, displayName }`
- `PATCH /api/drivers/:id` — update password and/or display name
- `DELETE /api/drivers/:id` — deletes the account; any vehicle row referencing it has `driver_user_id` cleared (not blocked)

## Driver → Vehicle Assignment

`FleetConfigModal`'s vehicle table (already row-based, one row per vehicle) gets one more column: **Driver account**, a `<select>` populated from `GET /api/drivers`, plus "ยังไม่ระบุ" (unassigned). Saved as part of the existing `PUT /api/fleet` payload (`driver_user_id` added to the vehicle row shape).

`GET /api/plan/my-route` resolution: look up the caller's `driver_user_id` match in `vehicles`, find the `routeSummary` in the active plan whose `vehicle.id` matches, return `{ routeSummary, legs, nodes }` for that route only — everything else stays server-side.

## Frontend

- `LoginMockup.tsx` → real form: username + password, `POST /api/auth/login`. Drop the "Use demo mode" button and email framing.
- `App.tsx`: on mount, `GET /api/auth/me` restores `currentUser` state (`{ id, username, role, displayName } | null`). Remove the `?care=1&driver=1` query-param entry point — real driver login replaces it.
- `role === 'admin'` → existing Sidebar shell, unchanged, plus a new "คนขับ" (Drivers) nav tab rendering `AdminDriversPanel` (list + create form + per-row delete).
- `role === 'driver'` → skip the Sidebar shell entirely. Render `DriverPortal` directly in a lightweight mobile-first wrapper (logo + logout button, no desktop nav), with `lockedRouteIndex` and `data` sourced from `GET /api/plan/my-route` instead of the local `processedData` state, and `onStepChange` wired to `POST /api/plan/progress`. `DriverPortal` already supports `lockedRouteIndex` — this is a data-source swap, not a rewrite of that component.
- Logout button in both shells.
- Care planner-side tab (`CareTab`, desktop, admin-facing) is unaffected. Care's driver-facing pieces (`DriverCheckIn`, geofence monitoring) are out of scope for this change per earlier decision — only `DriverPortal` is gated behind driver login.

## Error Handling

- Wrong credentials → 401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" (no user-enumeration hint about which field was wrong)
- Driver with no vehicle assigned → `GET /api/plan/my-route` returns `{ route: null }`; portal shows "ยังไม่ได้รับมอบหมายเส้นทาง กรุณาติดต่อผู้ดูแลระบบ"
- Session cookie missing/expired on any protected route → 401 → frontend clears `currentUser`, bounces to login
- Driver POSTing `progress` for a `routeIndex` that isn't theirs → 403 (defense in depth; the UI never offers this route, but the endpoint doesn't trust the client)
- Non-admin hitting `/api/drivers/*` or `PUT /api/fleet` → 403

## Testing

- `server/routes/auth.test.ts` — login success/failure, session persists across requests, `/me`, logout invalidates the session
- `server/routes/drivers.test.ts` — admin CRUD; driver-role and unauthenticated callers get 403/401
- `server/routes/plan.test.ts` (extend) — `/plan/my-route` returns only the caller's route; `/progress` rejects a foreign `routeIndex`
- `server/routes/fleet.test.ts` (extend) — `driver_user_id` round-trips through `PUT`/`GET`
- `LoginMockup.test.tsx` — update for real submit (mock `fetch`)
- New: driver-shell smoke test — `role: 'driver'` renders `DriverPortal` without the Sidebar

## Out of Scope

- Multi-tenant / multiple companies on one deployment
- Password reset / email flows (admin sets a driver's password directly)
- Live GPS or progress polling on the admin side (admin can already see full plan state via existing `/api/plan/active` and `/api/plan/progress`; a live-updating dashboard view is a separate, later feature if wanted)
- Gating Care's `DriverCheckIn`/geofence flow behind login (stays a separate, ungated entry point for now)
- Historical plan archive (only the single latest `active_plan` is kept, as today)
