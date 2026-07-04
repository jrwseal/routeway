# Fixed Cost per Truck — Design

**Goal:** Fleet Config currently only models per-km fuel cost and per-hour driver wage. Add a fixed cost per truck (e.g. rental/depreciation) so Cost figures reflect trucks that get deployed, not just distance driven.

## Data Model

`Vehicle` (`src/types.ts`) gets a new field:

```ts
export interface Vehicle {
  id: string;
  type: string;
  name: string;
  capacityCBM: number;
  fuelConsumption: number;
  fixedCost: number; // new — บาท per trip/route
  color: string;
}
```

`DEFAULT_FLEET_POOL` (`src/lib/geo.ts`) sets `fixedCost: 0` for every default vehicle — this is a non-breaking default; existing Cost figures don't change until the user sets a nonzero value in Fleet Config.

## UI

`FleetConfigModal.tsx` — each per-vehicle card (already has Capacity (CBM) and Fuel (L/km) inputs, editable per individual truck instance) gets one more input: **Fixed Cost (บาท/เที่ยว)**, same layout/styling as the existing two fields, using the existing `updateVehicle(id, field, value)` helper (already generic over `keyof Vehicle`).

## Cost Calculation

`src/lib/geo.ts`'s `processData`:

- **Milk Run cost** (line ~333, inside the per-route loop where `assignedVehicle` is the one truck assigned to that entire route): add `assignedVehicle.fixedCost` once per route.
  ```ts
  milkRunCost +=
    routeDistance * assignedVehicle.fuelConsumption * getFuelPrice(assignedVehicle.type) +
    (routeWaitingMinutes / 60) * params.driverWage +
    assignedVehicle.fixedCost;
  ```
- **Traditional baseline cost** (line ~203, inside the per-node loop that models each customer as an independent round trip): add `baselineVehicle.fixedCost` once per node.
  ```ts
  traditionalCost +=
    roundTripDist * baselineVehicle.fuelConsumption * getFuelPrice(baselineVehicle.type) +
    (waitMin / 60) * params.driverWage +
    baselineVehicle.fixedCost;
  ```

This is the only place cost is computed — `milkRunCost`/`traditionalCost` already flow through `ProcessedData`/`ComparisonResult` into every consumer (Dashboard, Carbon Footprint, Statistics Car, Algorithm Comparison) without further changes.

## Testing

`processData` (in `geo.ts`) has no existing unit tests — it's async and calls the OSRM `getRoute()` API; only the pure route-building functions in `algorithms.ts` are unit-tested (`algorithms.test.ts`). This change follows that existing project precedent rather than introducing new test infrastructure. Verify manually in-browser:
- With `fixedCost: 0` for all vehicles (the shipped default), Cost figures across all tabs are unchanged from before this change (regression check).
- Setting a nonzero fixed cost for one vehicle type and re-running a comparison shows Cost increase proportional to (routes assigned to that type) for Milk Run and (customers assigned to that type) for Traditional baseline.
