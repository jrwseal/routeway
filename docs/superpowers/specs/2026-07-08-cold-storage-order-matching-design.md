# Cold-Storage Order Matching — Design

## Problem

The cold-storage vehicle *type* (shipped separately) lets a fleet include รถห้องเย็น, but nothing today ties a specific order's cold-chain requirement to which vehicle carries it. Import data (`Tet custom รวม.csv`) includes a per-stop column `ต้องการรถห้องเย็น` (ใช่/ไม่) that isn't read at all. We need: orders marked "ใช่" must ride in a cold-storage vehicle, orders marked "ไม่" can ride in any vehicle (including a cold one, if convenient), and the system must refuse to compute a plan it cannot physically fulfill rather than silently mis-assigning a vehicle.

## Why Not a Simpler Fix

Vehicle assignment happens *after* routes are geographically clustered (`src/lib/geo.ts` `processData`), using each route's total volume against a capacity ceiling drawn from the *entire* fleet pool. Restricting assignment to cold vehicles only at that late stage is unsafe: a route can be built assuming up to the largest vehicle's capacity (e.g. 48 CBM from a 10-wheel) when the largest cold van only holds 10 CBM, producing a cold-heavy route no cold vehicle can legally carry. The constraint must be enforced during route construction, not bolted on after.

## Data Model

`RouteNode` (`src/types.ts`) gains:
```ts
requiresColdStorage: boolean;
```

## CSV Import (`src/components/Sidebar.tsx`)

The parser reads the exact header `ต้องการรถห้องเย็น` (matches the Thai source data):
```ts
requiresColdStorage: row['ต้องการรถห้องเย็น']?.trim() === 'ใช่',
```
Missing column, empty value, or anything other than exactly `ใช่` → `false`. Every existing CSV (no such column) imports with `requiresColdStorage: false` on every row — fully backward compatible, zero behavior change for current data.

## Blocking Validation

New pure function in a new file `src/lib/coldStorageValidation.ts`:

```ts
export function validateColdStorageFleet(nodes: RouteNode[], fleetPool: Vehicle[]): string | null
```

Logic:
1. `coldNodes = nodes.slice(1).filter(n => n.requiresColdStorage)` (skip depot at index 0). If empty → return `null` (no-op for the common case).
2. `coldVehicles = fleetPool.filter(v => v.type === 'cold-storage')`. If empty → return an error string telling the user to add a cold-storage vehicle in Fleet Config before computing.
3. `totalColdVolume = sum(coldNodes[].demandVolume)`, `totalColdCapacity = sum(coldVehicles[].capacityCBM)`. If `totalColdVolume > totalColdCapacity` → return an error string stating both numbers (CBM).
4. Otherwise → return `null`.

Called from `App.tsx`'s `handleDataLoaded`, immediately after the existing `nodes.length < 2` check, using the already-loaded `activeFleetPool`. A non-null return triggers `alert(msg); return;` — the same synchronous-reject pattern the CSV parser already uses for missing Lat/Lon — **before** the params modal opens and before any algorithm runs. This is required, not just cleaner: `handleCompareAll` runs 8 algorithm variants via `Promise.allSettled`, and a thrown error inside `processData` would be caught per-variant and only `console.warn`'d, never surfaced to the user.

## Routing (`src/lib/geo.ts` `processData`)

Extract the existing route-build + two-opt + vehicle-assignment + leg-construction block (today's single unconditional pass) into a reusable local function:

```ts
async function processGroup(
  groupNodes: RouteNode[],       // [depot, ...group-specific customers]
  groupParams: ProcessingParams, // fleetPool here = the vehicles ELIGIBLE for this group
                                  // (also bounds each route's capacity ceiling via getMaxCapacity)
  availableFleet: Vehicle[],     // shared across both group calls, mutated (spliced) as vehicles are assigned
  startRouteIndex: number,
): Promise<{
  legs: RouteLeg[];
  summaries: RouteSummary[];
  distance: number;
  co2: number;
  cost: number;
  waitingMinutes: number;
  nextRouteIndex: number;
}>
```

Vehicle assignment inside `processGroup` restricts eligibility to `groupParams.fleetPool` (by vehicle `id`) when picking from the shared `availableFleet`, and falls back to `getSmallestVehicle(routeVolume, groupParams.fleetPool)` — never the unrestricted full pool — when `availableFleet` has no eligible vehicle left (mirrors today's "reuse a vehicle for a second trip" fallback, but scoped correctly so the cold-only constraint can never be silently broken by the fallback path).

`processData` becomes:
```ts
const coldCustomers = nodes.slice(1).filter(n => n.requiresColdStorage);
const regularCustomers = nodes.slice(1).filter(n => !n.requiresColdStorage);
let availableFleet = [...params.fleetPool].sort((a, b) => a.capacityCBM - b.capacityCBM);
let routeIndex = 1;
// accumulate legs/summaries/distance/co2/cost/waitingMinutes from up to two processGroup calls:

if (coldCustomers.length > 0) {
  const coldParams = { ...params, fleetPool: params.fleetPool.filter(v => v.type === 'cold-storage') };
  const result = await processGroup([depot, ...coldCustomers], coldParams, availableFleet, routeIndex);
  // accumulate; routeIndex = result.nextRouteIndex
}
if (regularCustomers.length > 0) {
  const result = await processGroup([depot, ...regularCustomers], params, availableFleet, routeIndex);
  // accumulate; routeIndex = result.nextRouteIndex
}
```

Cold group runs first (more constrained), drawing down the shared `availableFleet`; the regular group gets whatever remains, and — same as today — may legally end up on a leftover cold vehicle (a cold van can carry ambient goods).

**Backward compatibility guarantee:** when `coldCustomers.length === 0` (default/untouched case), only the `regularCustomers` branch runs, with `regularCustomers` equal to *all* customers and `params` unchanged — behaviorally identical to today's single-pass code. No changes to `src/lib/algorithms.ts` or `checkRouteFeasible`.

**Traditional-baseline fix:** the existing per-node "traditional back-and-forth" cost/CO2 loop (used only for the savings-% comparison metric) currently calls `getSmallestVehicle(vol, [...params.fleetPool])` ignoring type. Update it to filter to cold-storage vehicles first when `node.requiresColdStorage` is true (falling back to the full pool only if that filter is somehow empty — unreachable in practice since the blocking validation already guarantees at least one cold vehicle exists whenever any cold node exists), so the baseline isn't artificially cheap relative to the real plan.

## UI (`src/components/RouteMap.tsx` only)

- Customer markers for `node.requiresColdStorage` stops use a distinct pin colored `#06B6D4` (same cyan already used for the cold-storage vehicle type) instead of the default red, with a tooltip "❄️ ต้องการรถห้องเย็น" on hover.
- The floating route-filter panel shows a small ❄️ next to any route entry whose legs include at least one cold-required stop (derived from `data.legs`, no new data needed).

No changes to `LiveDeliveryStatus.tsx`, `Dashboard.tsx`, or any other component.

## Testing

- `src/lib/coldStorageValidation.test.ts` (new): no cold nodes → `null`; cold nodes + zero cold vehicles → error; cold nodes + insufficient cold capacity → error with correct numbers; cold nodes + sufficient cold capacity → `null`.
- `src/lib/geo.ts` / `processData`: no new integration test. The repo has no existing test coverage of `processData` itself (it performs live network calls with a Haversine fallback; `geo.test.ts` only covers the pure `parseVehicleTime` helper) — this design follows that established convention rather than introducing new async/network test infrastructure.
- `src/components/Sidebar.tsx` CSV parsing: no test, matching current convention (no `Sidebar.test.tsx` exists today).
- `src/components/RouteMap.tsx`: no test, matching current convention (no component-test harness in this repo — same situation noted for `FleetConfigModal.tsx` in the prior feature).

## Out of Scope

- No changes to `src/lib/algorithms.ts` or `checkRouteFeasible`.
- No badge/indicator outside `RouteMap.tsx` (e.g. `LiveDeliveryStatus.tsx`, `Dashboard.tsx` stat cards).
- No per-route-count feasibility pre-check beyond the total-capacity sum check — if cold vehicle *count* (not capacity) is the bottleneck, the existing "reuse a vehicle for a second trip" fallback resolves it, since every cold route is already bounded by some single cold vehicle's capacity by construction.
