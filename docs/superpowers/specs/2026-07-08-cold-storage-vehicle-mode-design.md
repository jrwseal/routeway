# Cold-Storage Vehicle Mode — Design

## Problem

Fleet Config only supports 3 truck types (4-wheel, 6-wheel, 10-wheel). We want to add a "cold storage" (รถห้องเย็น) vehicle type, but it must be opt-in: a toggle that, when off, keeps the app behaving exactly as it does today (default state for all existing deployments).

## Data Model

`settings` table gains one column, added via the same guarded-migration pattern already used for `fuel_price` / `departure_time` on `vehicles` in `server/db.ts`:

```sql
ALTER TABLE settings ADD COLUMN enable_cold_storage INTEGER NOT NULL DEFAULT 0
```

Default `0` (off) — existing/new deployments are unaffected until a user explicitly flips the toggle.

No changes to the `vehicles` table. Cold-storage vehicles are stored as ordinary rows with `type = 'cold-storage'`.

## API (`server/routes/fleet.ts`)

- `GET /fleet` response gains `enableColdStorage: boolean` (mapped from `settings.enable_cold_storage`), alongside existing `vehicles` and `driverWage`.
- `PUT /fleet` accepts `enableColdStorage` in the body and persists it to `settings`.
- **Server-side guard**: if `enableColdStorage === false` and any vehicle in the submitted `vehicles` array has `type === 'cold-storage'`, reject with `400` and message `'Cannot disable cold storage while cold-storage vehicles exist'`. This backstops the UI-level block (see below) against direct API calls that skip the UI.

`src/lib/api.ts`: `FleetConfig` interface gains `enableColdStorage: boolean`.

## Frontend (`src/components/FleetConfigModal.tsx`)

New vehicle type entry:

| type | label | color | capacityCBM | fuelConsumption | fixedCost |
|---|---|---|---|---|---|
| `cold-storage` | รถห้องเย็น | `#06B6D4` (cyan) | 10 | 0.18 | 500 |

These are used as `addVehicle('cold-storage')` defaults, same pattern as the other 3 types.

**Toggle**: a switch placed next to the driver-wage field, labeled "เปิดใช้งานรถห้องเย็น" (Enable cold-storage vehicles).

- **On** → `'cold-storage'` is included in `VEHICLE_TYPES`, so it appears in the add-vehicle button row and in every per-row type `<select>`.
- **Off** → `'cold-storage'` is excluded from the add-vehicle buttons and the type dropdown. Existing non-cold vehicle rows are unaffected.
- **Disabled state**: the toggle itself cannot be switched off (rendered disabled, with a tooltip/title explaining why) whenever at least one vehicle in the current (unsaved) list has `type === 'cold-storage'`. The user must remove or retype those vehicles first.
- Toggle state is loaded from `getFleet()` and saved as part of the existing `saveFleet()` call (single PUT, no new endpoint).

## Optimization / Algorithms

No changes required. `Vehicle.type` is already a free-form string; `src/lib/algorithms.ts` does not hardcode the 3 existing type values. Cold-storage vehicles flow through capacity/routing/cost logic identically to any other vehicle once present in the fleet pool.

## Testing

- `server/routes/fleet.test.ts`:
  - Seeded default fleet returns `enableColdStorage: false`.
  - PUT with `enableColdStorage: true` + a `cold-storage` vehicle round-trips correctly.
  - PUT with `enableColdStorage: false` while a `cold-storage` vehicle is present in the payload returns `400`.
- `FleetConfigModal` test (new or extended): toggle off hides cold-storage from add-buttons/dropdown; adding a cold-storage vehicle then disables the toggle; removing it re-enables the toggle.

## Out of Scope

- No order/route-level "requires refrigeration" matching — cold-storage is purely a fleet capacity/cost category, same as the other 3 types.
- No migration of the toggle default to `true` for any environment.
