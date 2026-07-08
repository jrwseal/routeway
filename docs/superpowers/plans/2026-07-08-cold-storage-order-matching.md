# Cold-Storage Order Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orders marked "ต้องการรถห้องเย็น" (ใช่) in the import CSV must be routed onto a cold-storage vehicle; the app must refuse to compute a plan it cannot physically fulfill rather than silently mis-assigning a vehicle.

**Architecture:** Partition customer stops into a cold-required group and a regular group at route-construction time (not after), running the existing chosen algorithm once per group against a shared, mutable vehicle pool — the cold group restricted to cold-storage vehicles for both its capacity ceiling and its assignment eligibility. A synchronous pre-check blocks (via `alert`) before any algorithm runs if the fleet cannot possibly satisfy the cold demand (no cold vehicle, or insufficient total cold capacity).

**Tech Stack:** React 19 + TypeScript, Vitest, existing VRP algorithms in `src/lib/algorithms.ts` (unchanged by this plan).

## Global Constraints

- CSV column header is exactly `ต้องการรถห้องเย็น`; a stop requires cold storage iff the trimmed cell value is exactly `ใช่`. Any other value or missing column → `false`. (spec: CSV Import)
- Blocking validation returns a non-null message when: (a) at least one stop requires cold storage AND the fleet has zero `type === 'cold-storage'` vehicles, OR (b) total cold-required demand volume exceeds total cold-storage vehicle capacity. Otherwise returns `null`. (spec: Blocking Validation)
- Validation runs in `App.tsx`'s `handleDataLoaded`, before the params modal opens — never inside `processData` (thrown errors there are silently swallowed per-variant by `Promise.allSettled` in `handleCompareAll`). (spec: Blocking Validation)
- No changes to `src/lib/algorithms.ts` or `checkRouteFeasible`. (spec: Why Not a Simpler Fix, Routing)
- When zero stops require cold storage (the default/untouched case), `processData`'s output must be identical to today's behavior — verified by the full existing test suite passing unchanged. (spec: Routing, Backward compatibility guarantee)
- UI changes are confined to `src/components/RouteMap.tsx`. No changes to `LiveDeliveryStatus.tsx`, `Dashboard.tsx`, or any other component. (spec: UI)

---

### Task 1: Data model and CSV import

**Files:**
- Modify: `src/types.ts:1-12` (`RouteNode` interface)
- Modify: `src/components/Sidebar.tsx:62-73` (CSV row mapping), `src/components/Sidebar.tsx:154` (hint text)
- Modify: `src/lib/algorithms.test.ts:6-13` (fixture factories, to keep compiling against the new required field)
- Modify: `src/lib/waitingAdvisor.test.ts:7-16` (fixture factory, same reason)

**Interfaces:**
- Consumes: nothing new.
- Produces: `RouteNode.requiresColdStorage: boolean`, consumed by Task 2 (`validateColdStorageFleet`), Task 5 (`processData` partitioning), and Task 6 (`RouteMap.tsx` badges).

This task has no new automated test — CSV parsing has no existing test file in this repo (`Sidebar.tsx` has no `Sidebar.test.tsx`), and this change follows that established convention. Verify with typecheck and the existing suite instead.

- [ ] **Step 1: Add the field to `RouteNode`**

In `src/types.ts`, change:

```typescript
export interface RouteNode {
  id: number;
  location: string;
  lat: number;
  lon: number;
  demandVolume: number;
  weight: number;
  readyTime: Date | null;
  dueTime: Date | null;
  originalReadyString?: string;
  originalDueString?: string;
}
```

to:

```typescript
export interface RouteNode {
  id: number;
  location: string;
  lat: number;
  lon: number;
  demandVolume: number;
  weight: number;
  requiresColdStorage: boolean;
  readyTime: Date | null;
  dueTime: Date | null;
  originalReadyString?: string;
  originalDueString?: string;
}
```

- [ ] **Step 2: Parse the CSV column in `Sidebar.tsx`**

In `src/components/Sidebar.tsx`, change the row-mapping object (around line 62-73):

```typescript
            return {
              id: index,
              location: row['Location'] || `Node ${index}`,
              lat: parseFloat(row['Lat']),
              lon: parseFloat(row['Lon']),
              demandVolume: parseFloat(row['Demand_Volume']) || 0,
              weight: parseFloat(row['Weight']) || 0,
              readyTime: parseTime(row['Ready_Time']),
              dueTime: parseTime(row['Due_Time']),
              originalReadyString: row['Ready_Time'],
              originalDueString: row['Due_Time'],
            }
```

to:

```typescript
            return {
              id: index,
              location: row['Location'] || `Node ${index}`,
              lat: parseFloat(row['Lat']),
              lon: parseFloat(row['Lon']),
              demandVolume: parseFloat(row['Demand_Volume']) || 0,
              weight: parseFloat(row['Weight']) || 0,
              requiresColdStorage: row['ต้องการรถห้องเย็น']?.trim() === 'ใช่',
              readyTime: parseTime(row['Ready_Time']),
              dueTime: parseTime(row['Due_Time']),
              originalReadyString: row['Ready_Time'],
              originalDueString: row['Due_Time'],
            }
```

Then update the hint text at line 154, from:

```tsx
          <span>Expected columns: Location, Lat, Lon, Demand_Volume, Ready_Time, Due_Time</span>
```

to:

```tsx
          <span>Expected columns: Location, Lat, Lon, Demand_Volume, Ready_Time, Due_Time (optional: ต้องการรถห้องเย็น)</span>
```

- [ ] **Step 3: Fix fixture factories so existing tests keep compiling**

In `src/lib/algorithms.test.ts`, change:

```typescript
const depot: RouteNode = {
  id: 0, location: 'Depot', lat: 13.7, lon: 100.5,
  demandVolume: 0, weight: 0, readyTime: null, dueTime: null,
};
const makeNode = (id: number, lat: number, lon: number, vol: number): RouteNode => ({
  id, location: `Node${id}`, lat, lon,
  demandVolume: vol, weight: 0, readyTime: null, dueTime: null,
});
```

to:

```typescript
const depot: RouteNode = {
  id: 0, location: 'Depot', lat: 13.7, lon: 100.5,
  demandVolume: 0, weight: 0, requiresColdStorage: false, readyTime: null, dueTime: null,
};
const makeNode = (id: number, lat: number, lon: number, vol: number): RouteNode => ({
  id, location: `Node${id}`, lat, lon,
  demandVolume: vol, weight: 0, requiresColdStorage: false, readyTime: null, dueTime: null,
});
```

In `src/lib/waitingAdvisor.test.ts`, change:

```typescript
const makeNode = (id: number, dueTime: Date | null = null): RouteNode => ({
  id,
  location: `Node${id}`,
  lat: 13.7,
  lon: 100.5,
  demandVolume: 5,
  weight: 5,
  readyTime: null,
  dueTime,
});
```

to:

```typescript
const makeNode = (id: number, dueTime: Date | null = null): RouteNode => ({
  id,
  location: `Node${id}`,
  lat: 13.7,
  lon: 100.5,
  demandVolume: 5,
  weight: 5,
  requiresColdStorage: false,
  readyTime: null,
  dueTime,
});
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npx vitest run`
Expected: `tsc --noEmit` passes with zero errors; all existing tests still pass (54/54 before this task — count may differ slightly depending on what else has landed; the point is zero failures and zero new errors).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/components/Sidebar.tsx src/lib/algorithms.test.ts src/lib/waitingAdvisor.test.ts
git commit -m "feat: add requiresColdStorage to RouteNode and parse it from CSV"
```

---

### Task 2: Blocking validation function

**Files:**
- Create: `src/lib/coldStorageValidation.ts`
- Test: `src/lib/coldStorageValidation.test.ts`

**Interfaces:**
- Consumes: `RouteNode` (with `requiresColdStorage` from Task 1), `Vehicle` from `src/types.ts`.
- Produces: `function validateColdStorageFleet(nodes: RouteNode[], fleetPool: Vehicle[]): string | null`. Consumed by Task 3 (`App.tsx`).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/coldStorageValidation.test.ts
import { describe, it, expect } from 'vitest';
import { validateColdStorageFleet } from './coldStorageValidation';
import type { RouteNode, Vehicle } from '../types';

function makeNode(overrides: Partial<RouteNode>): RouteNode {
  return {
    id: 1, location: 'Stop', lat: 13.3, lon: 100.9, demandVolume: 5, weight: 0,
    requiresColdStorage: false, readyTime: null, dueTime: null, ...overrides,
  };
}

function makeVehicle(overrides: Partial<Vehicle>): Vehicle {
  return {
    id: 'v1', type: '4-wheel', name: 'Truck', capacityCBM: 12,
    fuelConsumption: 0.12, fixedCost: 300, color: '#10B981',
    fuelPrice: 35, departureTime: '08:00', ...overrides,
  };
}

describe('validateColdStorageFleet', () => {
  it('returns null when no node requires cold storage', () => {
    const nodes = [makeNode({ id: 0 }), makeNode({ id: 1, requiresColdStorage: false })];
    const fleet = [makeVehicle({})];
    expect(validateColdStorageFleet(nodes, fleet)).toBeNull();
  });

  it('blocks when cold nodes exist but no cold-storage vehicle in fleet', () => {
    const nodes = [makeNode({ id: 0 }), makeNode({ id: 1, requiresColdStorage: true, demandVolume: 5 })];
    const fleet = [makeVehicle({ type: '4-wheel' })];
    const result = validateColdStorageFleet(nodes, fleet);
    expect(result).not.toBeNull();
    expect(result).toContain('รถห้องเย็น');
  });

  it('blocks when cold demand exceeds total cold vehicle capacity', () => {
    const nodes = [
      makeNode({ id: 0 }),
      makeNode({ id: 1, requiresColdStorage: true, demandVolume: 12 }),
      makeNode({ id: 2, requiresColdStorage: true, demandVolume: 12 }),
    ];
    const fleet = [makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 })];
    const result = validateColdStorageFleet(nodes, fleet);
    expect(result).not.toBeNull();
    expect(result).toContain('24');
    expect(result).toContain('10');
  });

  it('returns null when cold vehicle capacity is sufficient', () => {
    const nodes = [
      makeNode({ id: 0 }),
      makeNode({ id: 1, requiresColdStorage: true, demandVolume: 8 }),
    ];
    const fleet = [makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 })];
    expect(validateColdStorageFleet(nodes, fleet)).toBeNull();
  });

  it('ignores node index 0 (depot) even if it were marked cold-required', () => {
    const nodes = [makeNode({ id: 0, requiresColdStorage: true, demandVolume: 999 })];
    const fleet = [makeVehicle({ type: '4-wheel' })];
    expect(validateColdStorageFleet(nodes, fleet)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/coldStorageValidation.test.ts`
Expected: FAIL with "Cannot find module './coldStorageValidation'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/coldStorageValidation.ts
import type { RouteNode, Vehicle } from '../types';

export function validateColdStorageFleet(nodes: RouteNode[], fleetPool: Vehicle[]): string | null {
  const coldNodes = nodes.slice(1).filter((n) => n.requiresColdStorage);
  if (coldNodes.length === 0) return null;

  const coldVehicles = fleetPool.filter((v) => v.type === 'cold-storage');
  if (coldVehicles.length === 0) {
    return 'มี order ที่ต้องการรถห้องเย็น แต่กองรถยังไม่มีรถห้องเย็น กรุณาเพิ่มรถห้องเย็นในตั้งค่ากองรถก่อนคำนวณ';
  }

  const totalColdVolume = coldNodes.reduce(
    (sum, n) => sum + (isNaN(n.demandVolume) ? 0 : n.demandVolume),
    0,
  );
  const totalColdCapacity = coldVehicles.reduce((sum, v) => sum + v.capacityCBM, 0);

  if (totalColdVolume > totalColdCapacity) {
    return `ปริมาณสินค้าที่ต้องการรถห้องเย็นรวม ${totalColdVolume.toFixed(1)} CBM เกินความจุรถห้องเย็นทั้งหมด (${totalColdCapacity.toFixed(1)} CBM) กรุณาเพิ่มรถห้องเย็น`;
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/coldStorageValidation.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/coldStorageValidation.ts src/lib/coldStorageValidation.test.ts
git commit -m "feat: add validateColdStorageFleet blocking-check function"
```

---

### Task 3: Wire validation into the import flow

**Files:**
- Modify: `src/App.tsx:1-63`

**Interfaces:**
- Consumes: `validateColdStorageFleet` from `src/lib/coldStorageValidation.ts` (Task 2); `activeFleetPool: Vehicle[]` (existing App.tsx state).
- Produces: no new exports.

This task has no new automated test (no `App.test.tsx` exists in this repo). Verify with typecheck and the existing suite.

- [ ] **Step 1: Import the validator**

In `src/App.tsx`, add to the imports (near the other local-module imports, e.g. after the `getFleet, saveActivePlan` import line):

```typescript
import { validateColdStorageFleet } from './lib/coldStorageValidation';
```

- [ ] **Step 2: Call it in `handleDataLoaded`**

Change:

```typescript
  const handleDataLoaded = (nodes: RouteNode[]) => {
    setComparisonData(null);
    setSavingsBaseline(null);
    if (nodes.length < 2) {
      alert("Manifest must contain at least a Depot and one customer node.");
      return;
    }

    setPendingNodes(nodes);
    setIsParamsModalOpen(true);
  };
```

to:

```typescript
  const handleDataLoaded = (nodes: RouteNode[]) => {
    setComparisonData(null);
    setSavingsBaseline(null);
    if (nodes.length < 2) {
      alert("Manifest must contain at least a Depot and one customer node.");
      return;
    }

    const coldStorageError = validateColdStorageFleet(nodes, activeFleetPool);
    if (coldStorageError) {
      alert(coldStorageError);
      return;
    }

    setPendingNodes(nodes);
    setIsParamsModalOpen(true);
  };
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npx vitest run`
Expected: `tsc --noEmit` passes with zero errors; all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: block CSV import when fleet cannot fulfill cold-storage demand"
```

---

### Task 4: Pure vehicle-selection helper (`selectVehicleForRoute`)

**Files:**
- Modify: `src/lib/geo.ts` (add new exported function, after `parseVehicleTime` and before `processData`)
- Modify: `src/lib/geo.test.ts` (add tests)

**Interfaces:**
- Consumes: `Vehicle` from `src/types.ts` (already imported in `geo.ts`).
- Produces: `export function selectVehicleForRoute(routeVolume: number, availableFleet: Vehicle[], eligibleFleetPool: Vehicle[]): Vehicle`. Consumed by Task 5 (`processGroup` inside `processData`).

This extracts and generalizes the vehicle-assignment logic that today lives inline in `processData` (the `assignedVehicle = availableFleet.find(...) ... else getSmallestVehicle(...)` block), so the exact mechanism that will enforce "cold orders never get a non-cold vehicle" is unit-tested in isolation, without needing to mock network calls or build async integration-test infrastructure for `processData` itself.

**Behavioral note (preserve exactly, do not "fix"):** the existing private `getSmallestVehicle` helper in `processData`, when no vehicle in the given fleet is large enough, falls back to sorting the *entire* given fleet ascending by capacity and returning index `0` — i.e. it returns the **smallest** vehicle in that fallback pool, not the largest, despite its own comment claiming "largest available." `selectVehicleForRoute` must replicate this exact real behavior (smallest-of-pool on total fallback), since changing it is out of scope for this feature.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/geo.test.ts` (new imports and a new `describe` block):

```typescript
import { parseVehicleTime, selectVehicleForRoute } from './geo';
import type { Vehicle } from '../types';

function makeVehicle(overrides: Partial<Vehicle>): Vehicle {
  return {
    id: 'v1', type: '4-wheel', name: 'Truck', capacityCBM: 12,
    fuelConsumption: 0.12, fixedCost: 300, color: '#10B981',
    fuelPrice: 35, departureTime: '08:00', ...overrides,
  };
}

describe('selectVehicleForRoute', () => {
  it('picks an eligible vehicle from availableFleet that fits the volume', () => {
    const cold = makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 });
    const regular = makeVehicle({ id: '4w-1', type: '4-wheel', capacityCBM: 12 });
    const result = selectVehicleForRoute(8, [regular, cold], [cold]);
    expect(result.id).toBe('cold-1');
  });

  it('never returns a vehicle outside eligibleFleetPool, even if availableFleet has a better fit', () => {
    const cold = makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 });
    const regular = makeVehicle({ id: '10w-1', type: '10-wheel', capacityCBM: 48 });
    const result = selectVehicleForRoute(20, [regular, cold], [cold]);
    expect(result.id).toBe('cold-1');
  });

  it('falls back to a fitting vehicle in eligibleFleetPool when availableFleet has none eligible', () => {
    const smallerCold = makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 });
    const biggerCold = makeVehicle({ id: 'cold-2', type: 'cold-storage', capacityCBM: 15 });
    const result = selectVehicleForRoute(8, [], [smallerCold, biggerCold]);
    expect(result.id).toBe('cold-1');
  });

  it('falls back to the smallest vehicle in eligibleFleetPool when none of them fit the volume', () => {
    const smallerCold = makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 });
    const biggerCold = makeVehicle({ id: 'cold-2', type: 'cold-storage', capacityCBM: 15 });
    const result = selectVehicleForRoute(20, [], [smallerCold, biggerCold]);
    expect(result.id).toBe('cold-1');
  });

  it('returns a vehicle whose id is findable in availableFleet for the caller to remove it', () => {
    const cold = makeVehicle({ id: 'cold-1', type: 'cold-storage', capacityCBM: 10 });
    const availableFleet = [cold];
    const result = selectVehicleForRoute(5, availableFleet, [cold]);
    expect(availableFleet.findIndex((v) => v.id === result.id)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/geo.test.ts`
Expected: FAIL — `selectVehicleForRoute` is not exported from `./geo`.

- [ ] **Step 3: Write the implementation**

In `src/lib/geo.ts`, add this function after `parseVehicleTime` and before `export async function processData`:

```typescript
export function selectVehicleForRoute(
  routeVolume: number,
  availableFleet: Vehicle[],
  eligibleFleetPool: Vehicle[],
): Vehicle {
  const eligibleIds = new Set(eligibleFleetPool.map((v) => v.id));
  const found = availableFleet.find((v) => eligibleIds.has(v.id) && v.capacityCBM >= routeVolume);
  if (found) return found;

  const suitable = eligibleFleetPool.filter((v) => v.capacityCBM >= routeVolume);
  const pool = suitable.length > 0 ? suitable : eligibleFleetPool;
  return [...pool].sort((a, b) => a.capacityCBM - b.capacityCBM)[0];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/geo.test.ts`
Expected: PASS (8 tests: 3 existing `parseVehicleTime` + 5 new)

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo.ts src/lib/geo.test.ts
git commit -m "feat: extract selectVehicleForRoute pure helper for type-constrained vehicle assignment"
```

---

### Task 5: Partition-and-route in `processData`

**Files:**
- Modify: `src/lib/geo.ts` (rewrite the body of `processData`)

**Interfaces:**
- Consumes: `selectVehicleForRoute` (Task 4), `RouteNode.requiresColdStorage` (Task 1), and the existing `nearestNeighbor`, `sweep`, `orOptAnnealing`, `solomonI1`, `clarkWrightSavings`, `twoOptFeasible` from `src/lib/algorithms.ts` (unchanged, imported already).
- Produces: no new exports — `processData`'s public signature and `ProcessedData` return shape are unchanged.

This task has no new automated test. The repository has no existing test coverage of `processData` itself (it performs live network calls via `getRoute`, with a synchronous Haversine fallback on failure/timeout; `geo.test.ts` only covers pure helpers). This plan follows that established convention. Correctness is instead covered by: (a) Task 4's unit tests on the extracted vehicle-selection logic that enforces the hard constraint, and (b) the full existing test suite (54+ tests across `algorithms.test.ts`, `db.test.ts`, `fleet.test.ts`, etc.) passing unchanged, which exercises every other code path that depends on `processData`'s output shape indirectly through fixtures and integration points.

- [ ] **Step 1: Add a cold-aware baseline-vehicle helper**

In `src/lib/geo.ts`, inside `processData`, immediately after the existing `getSmallestVehicle` helper definition:

```typescript
  // Helper to find the smallest vehicle that fits the volume
  const getSmallestVehicle = (volume: number, fleet: Vehicle[]) => {
    let suitable = fleet.filter((v) => v.capacityCBM >= volume);
    if (suitable.length === 0) {
      // Fallback to the largest available if nothing fits (or all pool if empty)
      suitable = fleet.length > 0 ? fleet : [...params.fleetPool];
    }
    suitable.sort((a, b) => a.capacityCBM - b.capacityCBM);
    return suitable[0];
  };
```

add:

```typescript
  // Same as getSmallestVehicle, but restricted to cold-storage vehicles for nodes that require one
  const getBaselineVehicle = (node: RouteNode) => {
    const vol = isNaN(node.demandVolume) ? 0 : node.demandVolume;
    const eligible = node.requiresColdStorage
      ? params.fleetPool.filter((v) => v.type === 'cold-storage')
      : [...params.fleetPool];
    return getSmallestVehicle(vol, eligible.length > 0 ? eligible : [...params.fleetPool]);
  };
```

- [ ] **Step 2: Use `getBaselineVehicle` in both traditional-baseline loops**

In the first loop (traditional back-and-forth distance/CO2/cost), change:

```typescript
    const baselineVehicle = getSmallestVehicle(vol, [...params.fleetPool]);
```

to:

```typescript
    const baselineVehicle = getBaselineVehicle(node);
```

In the second loop (traditional fuel, near the end of the function), change:

```typescript
  let traditionalFuel = 0;
  for (let i = 1; i < nodes.length; i++) {
    const vol = isNaN(nodes[i].demandVolume) ? 0 : nodes[i].demandVolume;
    const v = getSmallestVehicle(vol, [...params.fleetPool]);
    traditionalFuel +=
      getFallbackDist([depot.lon, depot.lat], [nodes[i].lon, nodes[i].lat]) *
      2 *
      v.fuelConsumption;
  }
```

to:

```typescript
  let traditionalFuel = 0;
  for (let i = 1; i < nodes.length; i++) {
    const v = getBaselineVehicle(nodes[i]);
    traditionalFuel +=
      getFallbackDist([depot.lon, depot.lat], [nodes[i].lon, nodes[i].lat]) *
      2 *
      v.fuelConsumption;
  }
```

- [ ] **Step 3: Replace the single-pass route-building/assignment block with `processGroup` + partitioned orchestration**

Delete this entire block from `processData` (originally lines 250-390 — from the `// 1. BUILD ROUTES` comment through the closing `}` of the `for (const routeSeq of routes)` loop):

```typescript
  // 1. BUILD ROUTES via selected algorithm
  function buildRoutes(): number[][] {
    switch (params.algorithm) {
      case 'nearest-neighbor': return nearestNeighbor(nodes, params);
      case 'sweep': return sweep(nodes, params);
      case 'or-opt-sa': return orOptAnnealing(nodes, params);
      case 'solomon-i1': return solomonI1(nodes, params);
      default: return clarkWrightSavings(nodes, params);
    }
  }

  let routes = buildRoutes();
  if (params.applyTwoOpt) {
    routes = routes.map(r => twoOptFeasible(r, nodes, params));
  }

  // 3. BEST-FIT / GREEN FLEET SELECTION & CO2 CALCULATION
  let availableFleet = [...params.fleetPool].sort(
    (a, b) => a.capacityCBM - b.capacityCBM,
  );

  let milkRunDistance = 0;
  let milkRunCO2 = 0;
  let milkRunCost = 0;
  let totalWaitingMinutes = 0;
  const globalLegs: RouteLeg[] = [];
  const routeSummaries: RouteSummary[] = [];
  let routeIndex = 1;

  for (const routeSeq of routes) {
    let routeVolume = 0;
    for (const idx of routeSeq) {
      routeVolume += isNaN(nodes[idx].demandVolume)
        ? 0
        : nodes[idx].demandVolume;
    }

    let assignedVehicle = availableFleet.find(
      (v) => v.capacityCBM >= routeVolume,
    );
    if (!assignedVehicle) {
      assignedVehicle = getSmallestVehicle(routeVolume, [...params.fleetPool]);
    } else {
      const vIndex = availableFleet.findIndex(
        (v) => v.id === assignedVehicle.id,
      );
      if (vIndex !== -1) availableFleet.splice(vIndex, 1);
    }

    let currentTime = parseVehicleTimeToday(assignedVehicle.departureTime);
    let currentLoc = depot;
    let routeDistance = 0;
    let routeWaitingMinutes = 0;

    for (const idx of routeSeq) {
      const node = nodes[idx];
      const routeRes = await getRoute(
        [currentLoc.lon, currentLoc.lat],
        [node.lon, node.lat],
        params.avgSpeed,
      );

      routeDistance += routeRes.distance;
      const arrivalTime = addSeconds(currentTime, routeRes.duration);

      let waitingMinutes = 0;
      let departureTime = arrivalTime;
      if (node.readyTime && isBefore(arrivalTime, node.readyTime)) {
        waitingMinutes =
          (node.readyTime.getTime() - arrivalTime.getTime()) / 60000;
        departureTime = node.readyTime;
      }
      routeWaitingMinutes += waitingMinutes;
      totalWaitingMinutes += waitingMinutes;

      let status: "On-Time" | "Delayed" | "N/A" = "N/A";
      if (node.dueTime) {
        if (arrivalTime.getTime() > node.dueTime.getTime()) {
          status = "Delayed";
        } else {
          status = "On-Time";
        }
      }

      globalLegs.push({
        fromNode: currentLoc,
        toNode: node,
        distanceKm: routeRes.distance,
        durationSec: routeRes.duration,
        arrivalDate: arrivalTime,
        waitingMinutes,
        status,
        geometry: routeRes.geometry,
        routeIndex,
      });

      currentTime = addSeconds(departureTime, 30 * 60);
      currentLoc = node;
    }

    const returnRoute = await getRoute(
      [currentLoc.lon, currentLoc.lat],
      [depot.lon, depot.lat],
      params.avgSpeed,
    );
    routeDistance += returnRoute.distance;

    globalLegs.push({
      fromNode: currentLoc,
      toNode: depot,
      distanceKm: returnRoute.distance,
      durationSec: returnRoute.duration,
      arrivalDate: null,
      waitingMinutes: 0,
      status: "N/A",
      geometry: returnRoute.geometry,
      isReturnToDepot: true,
      routeIndex,
    });

    milkRunDistance += routeDistance;
    const routeCO2 =
      (2621 * assignedVehicle.fuelConsumption * routeDistance) / 1000;
    milkRunCO2 += routeCO2;
    milkRunCost +=
      routeDistance *
        assignedVehicle.fuelConsumption *
        assignedVehicle.fuelPrice +
      (routeWaitingMinutes / 60) * params.driverWage +
      assignedVehicle.fixedCost;

    routeSummaries.push({
      routeIndex,
      totalVolume: routeVolume,
      volumeUtilization: (routeVolume / assignedVehicle.capacityCBM) * 100,
      distanceKm: routeDistance,
      vehicle: assignedVehicle,
    });

    routeIndex++;
  }
```

Replace it with:

```typescript
  // 1-3. PARTITIONED ROUTE-BUILD + BEST-FIT ASSIGNMENT
  // Cold-required stops are routed as their own group, restricted to cold-storage
  // vehicles for both the capacity ceiling used during route construction and for
  // vehicle assignment. Regular stops are routed exactly as before. Both groups
  // draw from one shared, mutable `availableFleet` so a vehicle is never double-booked
  // across groups.
  async function processGroup(
    groupNodes: RouteNode[],
    groupParams: ProcessingParams,
    availableFleet: Vehicle[],
    startRouteIndex: number,
  ): Promise<{
    legs: RouteLeg[];
    summaries: RouteSummary[];
    distance: number;
    co2: number;
    cost: number;
    waitingMinutes: number;
    nextRouteIndex: number;
  }> {
    const groupDepot = groupNodes[0];

    function buildGroupRoutes(): number[][] {
      switch (groupParams.algorithm) {
        case 'nearest-neighbor': return nearestNeighbor(groupNodes, groupParams);
        case 'sweep': return sweep(groupNodes, groupParams);
        case 'or-opt-sa': return orOptAnnealing(groupNodes, groupParams);
        case 'solomon-i1': return solomonI1(groupNodes, groupParams);
        default: return clarkWrightSavings(groupNodes, groupParams);
      }
    }

    let routes = buildGroupRoutes();
    if (groupParams.applyTwoOpt) {
      routes = routes.map((r) => twoOptFeasible(r, groupNodes, groupParams));
    }

    const legs: RouteLeg[] = [];
    const summaries: RouteSummary[] = [];
    let distance = 0;
    let co2 = 0;
    let cost = 0;
    let waitingMinutes = 0;
    let routeIndex = startRouteIndex;

    for (const routeSeq of routes) {
      let routeVolume = 0;
      for (const idx of routeSeq) {
        routeVolume += isNaN(groupNodes[idx].demandVolume) ? 0 : groupNodes[idx].demandVolume;
      }

      const assignedVehicle = selectVehicleForRoute(routeVolume, availableFleet, groupParams.fleetPool);
      const vIndex = availableFleet.findIndex((v) => v.id === assignedVehicle.id);
      if (vIndex !== -1) availableFleet.splice(vIndex, 1);

      let currentTime = parseVehicleTimeToday(assignedVehicle.departureTime);
      let currentLoc = groupDepot;
      let routeDistance = 0;
      let routeWaitingMinutes = 0;

      for (const idx of routeSeq) {
        const node = groupNodes[idx];
        const routeRes = await getRoute(
          [currentLoc.lon, currentLoc.lat],
          [node.lon, node.lat],
          groupParams.avgSpeed,
        );

        routeDistance += routeRes.distance;
        const arrivalTime = addSeconds(currentTime, routeRes.duration);

        let waitingMin = 0;
        let departureTime = arrivalTime;
        if (node.readyTime && isBefore(arrivalTime, node.readyTime)) {
          waitingMin = (node.readyTime.getTime() - arrivalTime.getTime()) / 60000;
          departureTime = node.readyTime;
        }
        routeWaitingMinutes += waitingMin;
        waitingMinutes += waitingMin;

        let status: 'On-Time' | 'Delayed' | 'N/A' = 'N/A';
        if (node.dueTime) {
          status = arrivalTime.getTime() > node.dueTime.getTime() ? 'Delayed' : 'On-Time';
        }

        legs.push({
          fromNode: currentLoc,
          toNode: node,
          distanceKm: routeRes.distance,
          durationSec: routeRes.duration,
          arrivalDate: arrivalTime,
          waitingMinutes: waitingMin,
          status,
          geometry: routeRes.geometry,
          routeIndex,
        });

        currentTime = addSeconds(departureTime, 30 * 60);
        currentLoc = node;
      }

      const returnRoute = await getRoute(
        [currentLoc.lon, currentLoc.lat],
        [groupDepot.lon, groupDepot.lat],
        groupParams.avgSpeed,
      );
      routeDistance += returnRoute.distance;

      legs.push({
        fromNode: currentLoc,
        toNode: groupDepot,
        distanceKm: returnRoute.distance,
        durationSec: returnRoute.duration,
        arrivalDate: null,
        waitingMinutes: 0,
        status: 'N/A',
        geometry: returnRoute.geometry,
        isReturnToDepot: true,
        routeIndex,
      });

      distance += routeDistance;
      const routeCO2 = (2621 * assignedVehicle.fuelConsumption * routeDistance) / 1000;
      co2 += routeCO2;
      cost +=
        routeDistance * assignedVehicle.fuelConsumption * assignedVehicle.fuelPrice +
        (routeWaitingMinutes / 60) * groupParams.driverWage +
        assignedVehicle.fixedCost;

      summaries.push({
        routeIndex,
        totalVolume: routeVolume,
        volumeUtilization: (routeVolume / assignedVehicle.capacityCBM) * 100,
        distanceKm: routeDistance,
        vehicle: assignedVehicle,
      });

      routeIndex++;
    }

    return { legs, summaries, distance, co2, cost, waitingMinutes, nextRouteIndex: routeIndex };
  }

  const coldCustomers = nodes.slice(1).filter((n) => n.requiresColdStorage);
  const regularCustomers = nodes.slice(1).filter((n) => !n.requiresColdStorage);

  const availableFleet = [...params.fleetPool].sort((a, b) => a.capacityCBM - b.capacityCBM);

  let milkRunDistance = 0;
  let milkRunCO2 = 0;
  let milkRunCost = 0;
  let totalWaitingMinutes = 0;
  const globalLegs: RouteLeg[] = [];
  const routeSummaries: RouteSummary[] = [];
  let routeIndex = 1;

  if (coldCustomers.length > 0) {
    const coldParams: ProcessingParams = {
      ...params,
      fleetPool: params.fleetPool.filter((v) => v.type === 'cold-storage'),
    };
    const result = await processGroup([depot, ...coldCustomers], coldParams, availableFleet, routeIndex);
    globalLegs.push(...result.legs);
    routeSummaries.push(...result.summaries);
    milkRunDistance += result.distance;
    milkRunCO2 += result.co2;
    milkRunCost += result.cost;
    totalWaitingMinutes += result.waitingMinutes;
    routeIndex = result.nextRouteIndex;
  }

  if (regularCustomers.length > 0) {
    const result = await processGroup([depot, ...regularCustomers], params, availableFleet, routeIndex);
    globalLegs.push(...result.legs);
    routeSummaries.push(...result.summaries);
    milkRunDistance += result.distance;
    milkRunCO2 += result.co2;
    milkRunCost += result.cost;
    totalWaitingMinutes += result.waitingMinutes;
    routeIndex = result.nextRouteIndex;
  }
```

Everything after this point in `processData` (the `// 4. UI METRICS SYNCHRONIZATION` section onward) is unchanged — it already only references `routeSummaries`, `globalLegs`, `milkRunDistance`, `milkRunCO2`, `milkRunCost`, `totalWaitingMinutes`, `traditionalDistance`, `traditionalCO2`, `traditionalCost`, `totalVolume`, `totalWeight`, and `getSmallestVehicle`/`getFallbackDist`, all of which still exist with the same names.

- [ ] **Step 4: Verify**

Run: `npm run lint && npx vitest run`
Expected: `tsc --noEmit` passes with zero errors; all existing tests pass unchanged (this is the regression signal for the "identical behavior when no cold customers" constraint — every existing test builds fleets/nodes with `requiresColdStorage: false` after Task 1, so they all take the `regularCustomers.length > 0` branch alone with `regularCustomers` equal to every customer and `params` unchanged, matching the pre-refactor code path exactly).

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo.ts
git commit -m "feat: partition routes by cold-storage requirement in processData"
```

---

### Task 6: RouteMap UI badges

**Files:**
- Modify: `src/components/RouteMap.tsx`

**Interfaces:**
- Consumes: `RouteNode.requiresColdStorage` (Task 1), `ProcessedData` (unchanged shape).
- Produces: no new exports.

This task has no new automated test — there is no component-test harness in this repo (same situation as `FleetConfigModal.tsx` in the prior cold-storage-vehicle-mode feature). Verify with typecheck and the existing suite; the visual result can be spot-checked by importing `Tet custom รวม.csv` in the running app.

- [ ] **Step 1: Add a distinct icon for cold-required stops**

In `src/components/RouteMap.tsx`, change:

```typescript
  const depotIcon = createPinIcon('black', 32);
  const customerIcon = createPinIcon('#ef4444', 28);
```

to:

```typescript
  const depotIcon = createPinIcon('black', 32);
  const customerIcon = createPinIcon('#ef4444', 28);
  const coldCustomerIcon = createPinIcon('#06B6D4', 28);
```

- [ ] **Step 2: Use it for cold-required markers, with a hover tooltip**

Change:

```tsx
        {data.nodes.slice(1).map((node, idx) => {
          const isActive = data.legs.some(leg => 
            activeRouteIndices.includes(leg.routeIndex) && 
            !leg.isReturnToDepot && 
            leg.toNode.lat === node.lat && 
            leg.toNode.lon === node.lon
          );
          if (!isActive) return null;
          return <Marker key={idx} position={[node.lat, node.lon]} icon={customerIcon} />;
        })}
```

to:

```tsx
        {data.nodes.slice(1).map((node, idx) => {
          const isActive = data.legs.some(leg => 
            activeRouteIndices.includes(leg.routeIndex) && 
            !leg.isReturnToDepot && 
            leg.toNode.lat === node.lat && 
            leg.toNode.lon === node.lon
          );
          if (!isActive) return null;
          if (node.requiresColdStorage) {
            return (
              <Marker key={idx} position={[node.lat, node.lon]} icon={coldCustomerIcon}>
                <Tooltip direction="top" offset={[0, 0]} opacity={1}>❄️ ต้องการรถห้องเย็น</Tooltip>
              </Marker>
            );
          }
          return <Marker key={idx} position={[node.lat, node.lon]} icon={customerIcon} />;
        })}
```

- [ ] **Step 3: Add a route-filter badge for routes containing a cold-required stop**

Change:

```tsx
            {data.routeSummaries.map(summary => {
              const isActive = activeRouteIndices.includes(summary.routeIndex);
              return (
                <label key={summary.routeIndex} className="flex items-center space-x-3 cursor-pointer p-1.5 hover:bg-slate-50 rounded">
                  <input 
                    type="checkbox"
                    checked={isActive}
                    onChange={() => toggleRoute(summary.routeIndex)}
                    className="w-4 h-4 text-fleet-navy rounded border-slate-300 focus:ring-fleet-navy"
                  />
                  <div className="flex-1 text-sm font-medium text-slate-700 truncate">
                    {summary.vehicle.name}
                  </div>
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: summary.vehicle.color }} />
                </label>
              );
            })}
```

to:

```tsx
            {data.routeSummaries.map(summary => {
              const isActive = activeRouteIndices.includes(summary.routeIndex);
              const hasColdStop = data.legs.some(leg => leg.routeIndex === summary.routeIndex && leg.toNode.requiresColdStorage);
              return (
                <label key={summary.routeIndex} className="flex items-center space-x-3 cursor-pointer p-1.5 hover:bg-slate-50 rounded">
                  <input 
                    type="checkbox"
                    checked={isActive}
                    onChange={() => toggleRoute(summary.routeIndex)}
                    className="w-4 h-4 text-fleet-navy rounded border-slate-300 focus:ring-fleet-navy"
                  />
                  <div className="flex-1 text-sm font-medium text-slate-700 truncate flex items-center gap-1">
                    {hasColdStop && <span title="มีจุดส่งที่ต้องการรถห้องเย็น">❄️</span>}
                    {summary.vehicle.name}
                  </div>
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: summary.vehicle.color }} />
                </label>
              );
            })}
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npx vitest run`
Expected: `tsc --noEmit` passes with zero errors; all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/RouteMap.tsx
git commit -m "feat: show cold-storage badge on map markers and route filter panel"
```

---

## Self-Review Notes

- **Spec coverage:** Data Model → Task 1. CSV Import → Task 1. Blocking Validation → Task 2 + Task 3 (wiring, with the `Promise.allSettled`-swallowing rationale preserved as a Global Constraint). Routing (partition-and-route, shared `availableFleet`, backward-compat guarantee, traditional-baseline fix) → Task 4 + Task 5. UI (RouteMap-only, marker color, tooltip, filter badge) → Task 6. Testing section's stated conventions (no `processData`/CSV/component tests, but pure functions tested) → matched exactly by which tasks do/don't have a Step-1/2 TDD pair.
- **Type consistency:** `RouteNode.requiresColdStorage: boolean` (Task 1) is the field every later task reads. `selectVehicleForRoute(routeVolume: number, availableFleet: Vehicle[], eligibleFleetPool: Vehicle[]): Vehicle` (Task 4) signature matches its one call site in Task 5's `processGroup`. `processGroup`'s return shape (`legs`, `summaries`, `distance`, `co2`, `cost`, `waitingMinutes`, `nextRouteIndex`) matches exactly how Task 5's two call sites destructure `result`.
- **No placeholders:** every step shows complete before/after code, not a description of what to change.
- **Fixture-breakage check:** Task 1 explicitly locates and fixes every `RouteNode` object literal in the codebase (`algorithms.test.ts`, `waitingAdvisor.test.ts`) that would otherwise fail to typecheck once `requiresColdStorage` becomes a required field — confirmed by direct search; `api.test.ts`'s mock JSON literals are untyped and don't need changes.
