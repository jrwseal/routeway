# Or-opt + Simulated Annealing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 7th algorithm variant — `orOptAnnealing` — to the Algorithm Comparison feature: a client-side local-search heuristic that relocates customers between routes (something none of the existing three algorithms do), guarded by simulated annealing and capacity/time-window feasibility checks.

**Architecture:** Seed from the existing `clarkWrightSavings` construction, then run a fixed 500-iteration simulated-annealing loop that tries relocating small customer segments between routes, accepting improving moves always and worsening moves probabilistically (cooling temperature). Finish with a `twoOpt` cleanup pass per route. Wire the result into the same `ProcessingParams.algorithm` / `buildRoutes()` / comparison-table pipeline every other algorithm already uses.

**Tech Stack:** TypeScript, Vitest (existing test runner), no new dependencies.

## Global Constraints

- No backend, no new npm dependencies — pure addition to existing `src/lib/algorithms.ts`, `src/types.ts`, `src/lib/geo.ts`, `src/App.tsx`, `src/components/AlgorithmComparison.tsx`.
- Every relocation move must pass both capacity and time-window (`Due_Time`) feasibility — reuse the validation logic `clarkWrightSavings` already has (lift it to module scope), do not reimplement it.
- Distance calculations inside the algorithm use the existing synchronous `getFallbackDist` (haversine) from `src/lib/geo.ts` — never call the async `getRoute()` OSRM function from within the algorithm.
- Fixed iteration count (500), no new UI controls, no configurable temperature/iteration params.
- `orOptAnnealing` gets exactly one comparison-table row (no separate 2-opt-toggle variant) since local search is inherent to the algorithm.

---

### Task 1: Lift `checkConstraints` to module scope as `checkRouteFeasible`

**Files:**
- Modify: `src/lib/algorithms.ts:14-37` (inside `clarkWrightSavings`)
- Test: `src/lib/algorithms.test.ts`

**Interfaces:**
- Consumes: `RouteNode[]`, `ProcessingParams` (existing types from `../types`), `getFallbackDist` (existing import from `./geo`), `getMaxCapacity`, `nodeVol` (existing module-scope helpers in `algorithms.ts`)
- Produces: `checkRouteFeasible(routeSeq: number[], nodes: RouteNode[], params: ProcessingParams): boolean` — used by Task 2 (`orOptAnnealing`) and continues to be used by `clarkWrightSavings`.

Currently `clarkWrightSavings` (lines 14-80) has a private closure `checkConstraints` (lines 18-37) that captures `nodes`, `maxCapacity`, `depot`, and `params` from the outer function scope. This task extracts it to a standalone module-level function with the same logic, taking those values as explicit parameters instead of closing over them.

- [ ] **Step 1: Write the failing test for the extracted function**

Add to `src/lib/algorithms.test.ts`, after the existing imports (line 2), change the import to include the new export:

```ts
import { nearestNeighbor, sweep, twoOpt, checkRouteFeasible } from './algorithms';
```

Add a new `describe` block at the end of the file (after the `twoOpt` describe block, which ends at line 100):

```ts
describe('checkRouteFeasible', () => {
  it('returns true for a route within capacity and no time windows', () => {
    const route = [1, 2];
    expect(checkRouteFeasible(route, nodes, baseParams)).toBe(true);
  });

  it('returns false when route volume exceeds max capacity', () => {
    const heavyParams: ProcessingParams = {
      ...baseParams,
      fleetPool: [{ id: 'v1', type: '4-wheel', name: 'Truck', capacityCBM: 5, fuelConsumption: 0.12, color: '#10B981' }],
    };
    const route = [1, 2]; // combined demandVolume = 10, capacity = 5
    expect(checkRouteFeasible(route, nodes, heavyParams)).toBe(false);
  });

  it('returns false when a node is reached after its due time', () => {
    const lateDepot: RouteNode = { ...depot };
    const strictNode: RouteNode = {
      id: 5, location: 'Strict', lat: 20.0, lon: 100.5,
      demandVolume: 1, weight: 0,
      readyTime: null,
      dueTime: new Date('2024-01-01T08:05:00'), // 5 min after startTime, node is ~700km away
    };
    const strictNodes = [lateDepot, strictNode];
    expect(checkRouteFeasible([1], strictNodes, baseParams)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/algorithms.test.ts -t checkRouteFeasible`
Expected: FAIL — `checkRouteFeasible` is not exported from `./algorithms` (TypeScript/import error, or `undefined is not a function`).

- [ ] **Step 3: Extract the function in `src/lib/algorithms.ts`**

Replace lines 14-37 (the start of `clarkWrightSavings` through the end of the `checkConstraints` closure) with a module-level function placed before `clarkWrightSavings`, and update `clarkWrightSavings` to call it:

```ts
export function checkRouteFeasible(routeSeq: number[], nodes: RouteNode[], params: ProcessingParams): boolean {
  const depot = nodes[0];
  const maxCapacity = getMaxCapacity(params);

  let routeVolume = 0;
  for (const idx of routeSeq) routeVolume += nodeVol(nodes[idx]);
  if (routeVolume > maxCapacity) return false;

  let currentTime = params.startTime;
  let currentLoc = depot;
  for (const idx of routeSeq) {
    const node = nodes[idx];
    const dist = getFallbackDist([currentLoc.lon, currentLoc.lat], [node.lon, node.lat]);
    const durationSec = (dist / params.avgSpeed) * 3600;
    const arrivalTime = new Date(currentTime.getTime() + durationSec * 1000);
    let departureTime = arrivalTime;
    if (node.readyTime && arrivalTime < node.readyTime) departureTime = node.readyTime;
    if (node.dueTime && arrivalTime > node.dueTime) return false;
    currentTime = new Date(departureTime.getTime() + 30 * 60 * 1000);
    currentLoc = node;
  }
  return true;
}

export function clarkWrightSavings(nodes: RouteNode[], params: ProcessingParams): number[][] {
  const depot = nodes[0];
  const maxCapacity = getMaxCapacity(params);

  const savings: { i: number; j: number; savings: number }[] = [];
  for (let i = 1; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dI = getFallbackDist([depot.lon, depot.lat], [nodes[i].lon, nodes[i].lat]);
      const dJ = getFallbackDist([depot.lon, depot.lat], [nodes[j].lon, nodes[j].lat]);
      const dIJ = getFallbackDist([nodes[i].lon, nodes[i].lat], [nodes[j].lon, nodes[j].lat]);
      const s = dI + dJ - dIJ;
      if (s > 0) savings.push({ i, j, savings: s });
    }
  }
  savings.sort((a, b) => b.savings - a.savings);

  let routes: number[][] = [];
  for (let i = 1; i < nodes.length; i++) routes.push([i]);

  for (const s of savings) {
    const { i, j } = s;
    let routeIIdx = -1, routeJIdx = -1;
    for (let r = 0; r < routes.length; r++) {
      if (routes[r].includes(i)) routeIIdx = r;
      if (routes[r].includes(j)) routeJIdx = r;
    }
    if (routeIIdx === -1 || routeJIdx === -1 || routeIIdx === routeJIdx) continue;

    const routeI = routes[routeIIdx];
    const routeJ = routes[routeJIdx];
    const iIsFirst = routeI[0] === i, iIsLast = routeI[routeI.length - 1] === i;
    const jIsFirst = routeJ[0] === j, jIsLast = routeJ[routeJ.length - 1] === j;

    if ((iIsFirst || iIsLast) && (jIsFirst || jIsLast)) {
      let ri = [...routeI], rj = [...routeJ];
      if (iIsFirst) ri.reverse();
      if (jIsLast) rj.reverse();
      const proposed = [...ri, ...rj];
      if (checkRouteFeasible(proposed, nodes, params)) {
        routes = routes.filter((_, idx) => idx !== routeIIdx && idx !== routeJIdx);
        routes.push(proposed);
      }
    }
  }
  return routes;
}
```

This is a pure extraction — `checkRouteFeasible`'s body is byte-for-byte the same logic as the old `checkConstraints`, just with `nodes` and `params` as explicit parameters instead of closed-over variables, and `maxCapacity`/`depot` recomputed from `params`/`nodes` inside the function instead of being captured. `unused var maxCapacity`/`depot` in `clarkWrightSavings` are still used elsewhere in that function (the savings-distance loop), so they stay declared there too.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/algorithms.test.ts -t checkRouteFeasible`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full existing test suite to confirm no regression**

Run: `npx vitest run src/lib/algorithms.test.ts`
Expected: PASS (all `nearestNeighbor`, `sweep`, `twoOpt`, `checkRouteFeasible` tests green — the extraction must not change `clarkWrightSavings`'s behavior, and there's no existing direct test of `clarkWrightSavings` to break, but confirm the file still type-checks)

Run: `npx tsc --noEmit -p .`
Expected: no new errors (ignore pre-existing `Could not find a declaration file for module 'react'` noise if present)

- [ ] **Step 6: Commit**

```bash
git add src/lib/algorithms.ts src/lib/algorithms.test.ts
git commit -m "refactor: lift checkConstraints to module-scope checkRouteFeasible

Needed so the upcoming Or-opt + SA algorithm can reuse the same
capacity/time-window validation Clarke-Wright Savings already has."
```

---

### Task 2: Implement `orOptAnnealing`

**Files:**
- Modify: `src/lib/algorithms.ts` (append new function after `twoOpt`, which ends at line 191 pre-Task-1; re-check current end-of-file line after Task 1's edit)
- Test: `src/lib/algorithms.test.ts`

**Interfaces:**
- Consumes: `clarkWrightSavings(nodes, params): number[][]`, `twoOpt(route, nodes): number[]`, `checkRouteFeasible(routeSeq, nodes, params): boolean`, `getMaxCapacity(params)`, `nodeVol(node)` — all from Task 1 and existing code in this file. `getFallbackDist` from `./geo` (already imported at top of file).
- Produces: `export function orOptAnnealing(nodes: RouteNode[], params: ProcessingParams): number[][]` — consumed by Task 3 (`geo.ts` `buildRoutes()`).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/algorithms.test.ts`, update the import line to include the new functions (also adds `clarkWrightSavings`, needed by the last test below):

```ts
import { nearestNeighbor, sweep, twoOpt, checkRouteFeasible, orOptAnnealing, clarkWrightSavings } from './algorithms';
```

Add a new `describe` block at the end of the file:

```ts
describe('orOptAnnealing', () => {
  it('covers all customer nodes exactly once', () => {
    const routes = orOptAnnealing(nodes, baseParams);
    const allIdx = routes.flat().sort((a, b) => a - b);
    expect(allIdx).toEqual([1, 2, 3, 4]);
  });

  it('no route exceeds max capacity', () => {
    const routes = orOptAnnealing(nodes, baseParams);
    for (const route of routes) {
      const vol = route.reduce((s, i) => s + nodes[i].demandVolume, 0);
      expect(vol).toBeLessThanOrEqual(20);
    }
  });

  it('every route is time-window feasible', () => {
    const routes = orOptAnnealing(nodes, baseParams);
    for (const route of routes) {
      expect(checkRouteFeasible(route, nodes, baseParams)).toBe(true);
    }
  });

  it('produces no route worse than the Clarke-Wright seed on a simple case', () => {
    const seedRoutes = clarkWrightSavings(nodes, baseParams);
    const seedDist = seedRoutes.reduce((total, r) => {
      const full = [0, ...r, 0];
      let d = 0;
      for (let i = 0; i < full.length - 1; i++) {
        const a = nodes[full[i]], b = nodes[full[i + 1]];
        d += Math.hypot(a.lat - b.lat, a.lon - b.lon);
      }
      return total + d;
    }, 0);

    const annealedRoutes = orOptAnnealing(nodes, baseParams);
    const annealedDist = annealedRoutes.reduce((total, r) => {
      const full = [0, ...r, 0];
      let d = 0;
      for (let i = 0; i < full.length - 1; i++) {
        const a = nodes[full[i]], b = nodes[full[i + 1]];
        d += Math.hypot(a.lat - b.lat, a.lon - b.lon);
      }
      return total + d;
    }, 0);

    expect(annealedDist).toBeLessThanOrEqual(seedDist + 0.001);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/algorithms.test.ts -t orOptAnnealing`
Expected: FAIL — `orOptAnnealing` is not exported from `./algorithms`.

- [ ] **Step 3: Implement `orOptAnnealing` in `src/lib/algorithms.ts`**

Append after `twoOpt` (end of file):

```ts
function routeDistance(routeSeq: number[], nodes: RouteNode[]): number {
  const depot = nodes[0];
  const full = [0, ...routeSeq, 0];
  let d = 0;
  for (let i = 0; i < full.length - 1; i++) {
    const a = full[i] === 0 ? depot : nodes[full[i]];
    const b = full[i + 1] === 0 ? depot : nodes[full[i + 1]];
    d += getFallbackDist([a.lon, a.lat], [b.lon, b.lat]);
  }
  return d;
}

function totalDistance(routes: number[][], nodes: RouteNode[]): number {
  return routes.reduce((sum, r) => sum + routeDistance(r, nodes), 0);
}

export function orOptAnnealing(nodes: RouteNode[], params: ProcessingParams): number[][] {
  const ITERATIONS = 500;
  let routes: number[][] = clarkWrightSavings(nodes, params).map(r => [...r]);
  let bestRoutes: number[][] = routes.map(r => [...r]);
  let bestCost = totalDistance(bestRoutes, nodes);
  let currentCost = bestCost;

  const initialT = currentCost > 0 ? currentCost / Math.max(nodes.length - 1, 1) : 1;
  let temperature = initialT;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    temperature *= 0.99;

    const sourceCandidates = routes
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => r.length > 0);
    if (sourceCandidates.length === 0) break;

    const { idx: sourceIdx } = sourceCandidates[Math.floor(Math.random() * sourceCandidates.length)];
    const sourceRoute = routes[sourceIdx];

    const segLen = Math.min(1 + Math.floor(Math.random() * 3), sourceRoute.length);
    const segStart = Math.floor(Math.random() * (sourceRoute.length - segLen + 1));
    const segment = sourceRoute.slice(segStart, segStart + segLen);

    const targetIdx = Math.floor(Math.random() * routes.length);

    const newSourceRoute = [...sourceRoute.slice(0, segStart), ...sourceRoute.slice(segStart + segLen)];

    const targetBaseRoute = targetIdx === sourceIdx ? newSourceRoute : routes[targetIdx];
    const insertPos = Math.floor(Math.random() * (targetBaseRoute.length + 1));
    const newTargetRoute = [
      ...targetBaseRoute.slice(0, insertPos),
      ...segment,
      ...targetBaseRoute.slice(insertPos),
    ];

    const candidateRoutes = routes.map((r, i) => {
      if (i === sourceIdx && i === targetIdx) return newTargetRoute;
      if (i === sourceIdx) return newSourceRoute;
      if (i === targetIdx) return newTargetRoute;
      return r;
    }).filter(r => r.length > 0);

    if (newSourceRoute.length > 0 && !checkRouteFeasible(newSourceRoute, nodes, params)) continue;
    if (!checkRouteFeasible(newTargetRoute, nodes, params)) continue;

    const candidateCost = totalDistance(candidateRoutes, nodes);
    const delta = candidateCost - currentCost;

    const accept = delta < 0 || Math.random() < Math.exp(-delta / Math.max(temperature, 0.0001));
    if (accept) {
      routes = candidateRoutes;
      currentCost = candidateCost;
      if (candidateCost < bestCost) {
        bestCost = candidateCost;
        bestRoutes = candidateRoutes.map(r => [...r]);
      }
    }
  }

  return bestRoutes.map(r => twoOpt(r, nodes));
}
```

Note on the `candidateRoutes` construction: when `sourceIdx === targetIdx` (relocating within the same route), `newTargetRoute` already reflects both the removal and the insertion (built from `newSourceRoute`), so that single branch correctly produces the final state for that route — the `i === sourceIdx && i === targetIdx` case returns `newTargetRoute`, not `newSourceRoute`, deliberately.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/algorithms.test.ts -t orOptAnnealing`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx vitest run src/lib/algorithms.test.ts`
Expected: PASS (all tests across all describe blocks)

Run: `npx tsc --noEmit -p .`
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/algorithms.ts src/lib/algorithms.test.ts
git commit -m "feat: add Or-opt + simulated annealing algorithm

Relocates 1-3 customer segments between routes with SA acceptance,
seeded from Clarke-Wright Savings, capacity/time-window checked on
every move. Closes the gap that 2-opt only optimizes within a route."
```

---

### Task 3: Wire `orOptAnnealing` into `ProcessingParams` and `buildRoutes()`

**Files:**
- Modify: `src/types.ts:52` (the `ProcessingParams.algorithm` union)
- Modify: `src/lib/geo.ts:10` (import) and the `buildRoutes()` switch (around line 212, inside `processData`)

**Interfaces:**
- Consumes: `orOptAnnealing` from `./algorithms` (Task 2)
- Produces: `ProcessingParams.algorithm` now accepts `'or-opt-sa'` — consumed by Task 4 (`App.tsx`)

- [ ] **Step 1: Update the type union**

In `src/types.ts`, line 52, change:

```ts
  algorithm: 'savings' | 'nearest-neighbor' | 'sweep';
```
to:
```ts
  algorithm: 'savings' | 'nearest-neighbor' | 'sweep' | 'or-opt-sa';
```

- [ ] **Step 2: Import and dispatch in `geo.ts`**

In `src/lib/geo.ts`, line 10, change:

```ts
import { clarkWrightSavings, nearestNeighbor, sweep, twoOpt } from './algorithms';
```
to:
```ts
import { clarkWrightSavings, nearestNeighbor, sweep, twoOpt, orOptAnnealing } from './algorithms';
```

Find the `buildRoutes()` function inside `processData` (the switch on `params.algorithm`, currently reading):

```ts
  function buildRoutes(): number[][] {
    switch (params.algorithm) {
      case 'nearest-neighbor': return nearestNeighbor(nodes, params);
      case 'sweep': return sweep(nodes, params);
      default: return clarkWrightSavings(nodes, params);
    }
  }
```

Add a case for `'or-opt-sa'`:

```ts
  function buildRoutes(): number[][] {
    switch (params.algorithm) {
      case 'nearest-neighbor': return nearestNeighbor(nodes, params);
      case 'sweep': return sweep(nodes, params);
      case 'or-opt-sa': return orOptAnnealing(nodes, params);
      default: return clarkWrightSavings(nodes, params);
    }
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no new errors

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: PASS (no test references `buildRoutes` directly, but this confirms nothing else broke)

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/geo.ts
git commit -m "feat: wire or-opt-sa into ProcessingParams and buildRoutes dispatch"
```

---

### Task 4: Add the 7th comparison variant in `App.tsx`

**Files:**
- Modify: `src/App.tsx:64-87` (the `variants` array and `labels` map inside `handleCompareAll`)

**Interfaces:**
- Consumes: `ProcessingParams.algorithm` now includes `'or-opt-sa'` (Task 3)
- Produces: `comparisonData` (state, unchanged type `ComparisonResult[]`) now has 7 rows instead of 6 whenever `handleCompareAll` runs — consumed by Task 5 (`AlgorithmComparison.tsx`)

- [ ] **Step 1: Add the variant and label**

In `src/App.tsx`, update the `variants` array type and contents (lines 64-71):

```ts
    const variants: { algorithm: 'savings' | 'nearest-neighbor' | 'sweep' | 'or-opt-sa'; applyTwoOpt: boolean }[] = [
      { algorithm: 'savings', applyTwoOpt: false },
      { algorithm: 'savings', applyTwoOpt: true },
      { algorithm: 'nearest-neighbor', applyTwoOpt: false },
      { algorithm: 'nearest-neighbor', applyTwoOpt: true },
      { algorithm: 'sweep', applyTwoOpt: false },
      { algorithm: 'sweep', applyTwoOpt: true },
      { algorithm: 'or-opt-sa', applyTwoOpt: false },
    ];
```

Update the `labels` map (lines 83-87):

```ts
    const labels: Record<string, string> = {
      savings: 'Clarke-Wright',
      'nearest-neighbor': 'Nearest Neighbor',
      sweep: 'Sweep',
      'or-opt-sa': 'Or-opt + SA',
    };
```

No other changes needed in `App.tsx` — the existing `Promise.allSettled(variants.map(...))` loop, `comparison.push(...)`, and auto-select-best-cost logic (lines 89-121) are generic over the variants array and require no modification.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no new errors

- [ ] **Step 3: Manual verification — run the dev server and upload a real test file**

Run: `npm run dev` (background)

Using the Playwright MCP tools (or manually in a browser), navigate to `http://localhost:3000`, upload one of the repo's real test manifests (e.g. `Test custom พัทยา.csv`), submit the routing-parameters modal, and confirm the Algorithm Comparison table shows **7 rows**, with the 7th labeled "Or-opt + SA".

Expected: table renders 7 rows, no console errors, "Or-opt + SA" row has plausible (non-zero, non-NaN) Distance/Cost/CO2/Trucks values.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add Or-opt + SA as 7th comparison variant"
```

---

### Task 5: Update `AlgorithmComparison.tsx` — "built-in" 2-opt label and disclosure text

**Files:**
- Modify: `src/components/AlgorithmComparison.tsx:35` (caption text)
- Modify: `src/components/AlgorithmComparison.tsx:55` (2-opt column cell)

**Interfaces:**
- Consumes: `ComparisonResult.algorithm === 'Or-opt + SA'` (string produced by Task 4's `labels` map) and `ComparisonResult.twoOpt` (existing field, always `false` for this row per Task 4)
- Produces: no new interfaces — this is leaf UI

- [ ] **Step 1: Update the disclosure caption**

In `src/components/AlgorithmComparison.tsx`, line 35, change:

```tsx
      <p className="text-sm text-slate-500 mb-6">Green cell = best value per metric. Detail views use the lowest-cost result. Time window compliance (Due_Time) is only guaranteed with Clarke-Wright Savings.</p>
```
to:
```tsx
      <p className="text-sm text-slate-500 mb-6">Green cell = best value per metric. Detail views use the lowest-cost result. Time window compliance (Due_Time) is guaranteed with Clarke-Wright Savings and Or-opt + SA.</p>
```

- [ ] **Step 2: Show "built-in" instead of "—" for the Or-opt + SA row's 2-opt cell**

Line 55 currently reads:

```tsx
                <td className="px-4 py-3 text-slate-500">{row.twoOpt ? '✓' : '—'}</td>
```

Change to:

```tsx
                <td className="px-4 py-3 text-slate-500">
                  {row.algorithm === 'Or-opt + SA' ? 'built-in' : row.twoOpt ? '✓' : '—'}
                </td>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no new errors

- [ ] **Step 4: Manual verification**

With the dev server running (from Task 4 Step 3, or restart with `npm run dev`), reload the browser, re-run the comparison with the same test CSV, and confirm:
- Caption reads "...guaranteed with Clarke-Wright Savings and Or-opt + SA."
- The "Or-opt + SA" row's "2-opt" column shows the text "built-in" (not ✓ or —).
- The "vs Savings" column still computes correctly for the Or-opt + SA row (compares against the Clarke-Wright Savings baseline row, same as Nearest Neighbor/Sweep rows do).

- [ ] **Step 5: Commit**

```bash
git add src/components/AlgorithmComparison.tsx
git commit -m "feat: label Or-opt + SA's local search as built-in, update disclosure text"
```

---

### Task 6: Full regression pass

**Files:** none modified — verification only

**Interfaces:** none

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all describe blocks across `algorithms.test.ts` (and any other existing test files) green.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no new errors (pre-existing `@types/react` noise, if any, is unrelated and can be ignored).

- [ ] **Step 3: Manual end-to-end pass on all three real test manifests**

With `npm run dev` running, upload each of the three repo-root CSVs in turn (`Test custom บางแสน.csv`, `Test custom พัทยา.csv`, `Test custom ศรีราชา.csv`), and for each confirm:
- Algorithm Comparison table shows 7 rows with no NaN/undefined values.
- Dashboard, Carbon Footprint, and Statistics Car tabs render without errors when viewing the Or-opt + SA row (click its "View" button).
- No new console errors appear (`browser_console_messages` if using Playwright MCP).

- [ ] **Step 4: Clean up any test artifacts**

If any temporary CSV copies were placed in `.playwright-mcp/` for browser testing, remove them:

```bash
rm -f .playwright-mcp/*.csv
```

(No commit needed for this step — it's cleanup of untracked test scratch files, not a repo change.)
