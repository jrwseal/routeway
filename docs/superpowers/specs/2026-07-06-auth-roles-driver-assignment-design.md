# Auth, Roles & Driver Assignment — Design Spec

## Problem

RouteWay Intelligence is currently a pure client-side SPA: no backend, no database, no auth. All state (fleet config, computed routes, delivery progress) lives only in the planner's browser memory and is lost on reload. There is no way to give a driver their own restricted login on a separate device that shows only their assigned route.

## Goal

Add a real login system with two account roles:

- **Planner**: full access (upload manifest, run algorithms, configure fleet, manage driver accounts). Can create/delete driver accounts.
- **Driver**: restricted to the Driver Portal only, and only to their own assigned vehicle's route.

Fleet configuration changes from a "count up/down per vehicle type" control to a per-vehicle table, with each row assignable to a driver account.

Single company / single tenant: all planners and drivers share one fleet and driver pool (per user decision — no multi-tenant isolation).

## Architecture

- New backend: Node/Express + SQLite (`better-sqlite3`), run as a separate process. Vite dev server proxies `/api/*` to it.
- Frontend keeps all existing VRP computation client-side (no change to `src/lib/algorithms.ts`, `geo.ts`). Only three areas move server-side: auth, fleet configuration, and the "active plan" the planner has selected as final.
- Auth: JWT in an httpOnly cookie. Passwords hashed with bcrypt.

## Data Model (SQLite)

```
users         (id, username UNIQUE, password_hash, role['planner'|'driver'], display_name, created_at)
vehicles      (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color, driver_user_id NULL FK->users.id)
settings      (id=1, driver_wage, fuel_price_4w, fuel_price_6w, fuel_price_10w)
active_plan   (id=1, created_at, optimization_criterion, params_json, nodes_json, legs_json, route_summaries_json)
plan_progress (route_index PK, current_step, step_state, updated_at)
```

`active_plan` holds a single row — the latest plan the planner finalized. Each time the planner selects a winning algorithm variant, this row is overwritten and `plan_progress` is reset to step 0 for every route.

## Auth & Roles

Endpoints:
- `POST /api/auth/login` — username/password → sets httpOnly JWT cookie
- `POST /api/auth/logout`
- `GET /api/auth/me` — returns `{ id, username, role, displayName }` or 401
- `GET/POST/DELETE /api/drivers` — planner-only; create/list/delete driver accounts (username, password, display name)

Role guard middleware:
- Planner-only: `/api/drivers/*`, `/api/fleet` (PUT), CSV upload/compute flow stays client-side (no endpoint needed), plan finalization (`POST /api/plan`)
- Driver-only reachable endpoints: `GET /api/plan/active` (filtered to their own route only), `POST /api/plan/progress` (only for their own `route_index`)

Frontend:
- Unauthenticated → Login screen only (username + password)
- `AuthContext` fetches `/api/auth/me` on load; exposes `{ user, role, logout }`
- role === 'driver' → Sidebar renders only the Driver Portal tab; all other tabs/routes are hidden client-side AND rejected server-side (defense in depth)
- role === 'planner' → full existing UI, plus new driver management screen (list drivers, add driver, delete driver)

## Fleet Configuration — Table Redesign

`FleetConfigModal` changes from a per-type count stepper to an explicit row-based table per vehicle type:

| ประเภท | ชื่อรถ | Capacity (CBM) | Fuel (L/km) | Fixed Cost | Driver account | ลบ |
|---|---|---|---|---|---|---|
| 4-wheel | รถ 4 ล้อ #1 | 3.5 | 0.12 | 800 | [dropdown] | 🗑 |

- "+ เพิ่มรถ" button per vehicle type adds a row (replaces count input)
- 🗑 button removes that specific row (replaces count-down-removes-from-end behavior)
- Driver dropdown is populated from `GET /api/drivers` (role=driver users); shows "ยังไม่ระบุ" (unassigned) as a valid option
- Save → `PUT /api/fleet` persists vehicles + wage/fuel settings to SQLite (replaces current `activeFleetPool` React state entirely — planner's App.tsx fetches fleet from the server on load instead of seeding from `DEFAULT_FLEET_POOL`)

## Driver Portal Restriction & Live Sync

- On login, a driver's portal calls `GET /api/plan/active`, which returns only the route(s) whose vehicle `driver_user_id` matches the logged-in driver. The existing "เลือกยานพาหนะ" dropdown is removed for driver-role users (nothing to choose — one driver, one assigned vehicle).
- If a driver has no vehicle assigned (`driver_user_id` not set on any vehicle), the portal shows: "ยังไม่ได้รับมอบหมายรถ กรุณาติดต่อ planner"
- Driver actions ("กำลังไปส่ง" / "ส่งเสร็จแล้ว") call `POST /api/plan/progress` with their own `route_index`, updating `plan_progress`
- Planner's dashboard polls `GET /api/plan/progress` every ~5s to show live status per vehicle (sufficient for single-company scale; no WebSocket needed)

## Error Handling

- Wrong credentials → 401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
- Expired/invalid JWT → 401 → frontend redirects to Login
- Driver with no assigned vehicle → friendly empty state (see above), not an error page
- Deleting a driver account that's currently assigned to a vehicle → vehicle's `driver_user_id` is cleared (set NULL), not blocked

## Testing

- Backend: vitest + supertest — auth flow (login/logout/me), role-guard middleware (planner vs driver access), drivers CRUD, fleet CRUD, plan/progress endpoints (including the reset-on-new-plan behavior and driver-route filtering)
- Frontend: existing vitest suite for `algorithms.ts`/`geo.ts` unchanged; add tests for role-gated rendering (driver sees only Driver Portal tab) and the fleet table's add/remove-row + driver-assignment interactions

## Out of Scope

- Multi-tenant / multiple independent companies sharing one deployment
- Password reset / email verification flows (planner resets a driver's password directly, no email step)
- WebSocket-based push updates (polling is sufficient at this scale)
- Historical plan archive (only the single latest `active_plan` is kept)
