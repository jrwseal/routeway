# Solomon I1 Insertion Heuristic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an 8th algorithm variant, `solomonI1`, to the Algorithm Comparison feature — a VRPTW-specific construction heuristic that prioritizes inserting far/time-sensitive customers before they become impossible to place, unlike Clarke-Wright's pure distance-savings merge order.

**Architecture:** Seed each new route with the unrouted customer farthest from the depot. Repeatedly find, for every unrouted customer, its cheapest feasible insertion position across all open routes (cost = added distance from splicing it in, feasibility = the existing `checkRouteFeasible`), then insert the customer with the highest "regret" (distance-from-depot minus its best insertion cost) — this prioritizes customers that are expensive/risky to leave for later. If no unrouted customer fits anywhere, start a new route. Wire the result into the same `ProcessingParams.algorithm` / `buildRoutes()` / comparison-table pipeline every other construction algorithm (Clarke-Wright, Nearest Neighbor, Sweep) already uses — including the same 2-opt on/off toggle producing two comparison rows.

**Tech Stack:** TypeScript, Vitest (existing test runner), no new dependencies.

## Global Constraints

- No backend, no new npm dependencies — pure addition to existing `src/lib/algorithms.ts`, `src/types.ts`, `src/lib/geo.ts`, `src/App.tsx`.
- Every candidate insertion's capacity/time-window feasibility must be checked via the existing `checkRouteFeasible(routeSeq, nodes, params)` — reused, never reimplemented.
- Distance calculations use the existing synchronous `getFallbackDist` (haversine) from `src/lib/geo.ts` — never call the async `getRoute()` OSRM function from within the algorithm.
- Fixed insertion-cost parameters: `c1(i, u, j) = d(i, u) + d(u, j) - d(i, j)` (the classic α1=1, α2=0, μ=1 distance-only I1 parameterization) and `c2(u) = d(depot, u) - c1_best(u)` for customer selection — no new UI controls to tune these.
- Seed rule: each new route starts with the unrouted customer farthest (straight-line) from the depot.
- `solomonI1` gets **two** comparison-table rows (with and without 2-opt), exactly like Clarke-Wright/Nearest Neighbor/Sweep — it is a construction heuristic, not a local-search cleanup step like `orOptAnnealing`, so it does **not** get the single "built-in" row treatment and `AlgorithmComparison.tsx` needs no changes (its existing `row.twoOpt ? '✓' : '—'` display already covers this case).

---

### Task 1: Implement `solomonI1` in `algorithms.ts`

**Files:**
- Modify: `src/lib/algorithms.ts` (append new function after `orOptAnnealing`, which currently ends the file)
- Test: `src/lib/algorithms.test.ts`

**Interfaces:**
- Consumes: `checkRouteFeasible(routeSeq, nodes, params): boolean` (existing, module-scope, from Task 1 of the earlier Or-opt+SA plan — already in `algorithms.ts`), `getFallbackDist` (existing import from `./geo`).
- Produces: `export function solomonI1(nodes: RouteNode[], params: ProcessingParams): number[][]` — consumed by Task 2 (`geo.ts`'s `buildRoutes()`).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/algorithms.test.ts`, update the import line to include `solomonI1` (the file already imports `getFallbackDist` from `./geo` and `checkRouteFeasible` from `./algorithms` for the earlier Or-opt+SA tests):

```ts
import { nearestNeighbor, sweep, twoOpt, checkRouteFeasible, orOptAnnealing, clarkWrightSavings, twoOptFeasible, solomonI1 } from './algorithms';
```

Add a new `describe` block at the end of the file:

```ts
describe('solomonI1', () => {
  it('covers all customer nodes exactly once', () => {
    const routes = solomonI1(nodes, baseParams);
    const allIdx = routes.flat().sort((a, b) => a - b);
    expect(allIdx).toEqual([1, 2, 3, 4]);
  });

  it('no route exceeds max capacity', () => {
    const routes = solomonI1(nodes, baseParams);
    for (const route of routes) {
      const vol = route.reduce((s, i) => s + nodes[i].demandVolume, 0);
      expect(vol).toBeLessThanOrEqual(20);
    }
  });

  it('every route is time-window feasible', () => {
    const routes = solomonI1(nodes, baseParams);
    for (const route of routes) {
      expect(checkRouteFeasible(route, nodes, baseParams)).toBe(true);
    }
  });

  it('produces no worse total distance than one truck per customer', () => {
    const routes = solomonI1(nodes, baseParams);
    const dist = (r: number[]) => {
      const full = [0, ...r, 0];
      let d = 0;
      for (let i = 0; i < full.length - 1; i++) {
        const a = full[i] === 0 ? depot : nodes[full[i]];
        const b = full[i + 1] === 0 ? depot : nodes[full[i + 1]];
        d += getFallbackDist([a.lon, a.lat], [b.lon, b.lat]);
      }
      return d;
    };
    const solomonDist = routes.reduce((total, r) => total + dist(r), 0);

    const perCustomerDist = [1, 2, 3, 4].reduce((total, idx) => {
      const node = nodes[idx];
      return total + 2 * getFallbackDist([depot.lon, depot.lat], [node.lon, node.lat]);
    }, 0);

    expect(solomonDist).toBeLessThanOrEqual(perCustomerDist + 0.001);
  });

  it('starts each new route with the customer farthest from the depot', () => {
    // With the shared 4-node fixture (all within max capacity 20), everything
    // fits in a single route, so the very first (and only) route's first
    // customer must be the farthest one from the depot.
    const routes = solomonI1(nodes, baseParams);
    const farthest = [1, 2, 3, 4].reduce((bi, i) => {
      const di = getFallbackDist([depot.lon, depot.lat], [nodes[i].lon, nodes[i].lat]);
      const db = getFallbackDist([depot.lon, depot.lat], [nodes[bi].lon, nodes[bi].lat]);
      return di > db ? i : bi;
    }, 1);
    expect(routes[0][0]).toBe(farthest);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/algorithms.test.ts -t solomonI1`
Expected: FAIL — `solomonI1` is not exported from `./algorithms` (TypeScript/import error, or `undefined is not a function`).

- [ ] **Step 3: Implement `solomonI1` in `src/lib/algorithms.ts`**

Append after `orOptAnnealing` (end of file):

```ts
export function solomonI1(nodes: RouteNode[], params: ProcessingParams): number[][] {
  const depot = nodes[0];
  const unrouted = new Set<number>();
  for (let i = 1; i < nodes.length; i++) unrouted.add(i);

  const routes: number[][] = [];

  const distToDepot = (idx: number) =>
    getFallbackDist([depot.lon, depot.lat], [nodes[idx].lon, nodes[idx].lat]);

  const distBetween = (a: number, b: number) => {
    const na = a === 0 ? depot : nodes[a];
    const nb = b === 0 ? depot : nodes[b];
    return getFallbackDist([na.lon, na.lat], [nb.lon, nb.lat]);
  };

  function seedNewRoute(): boolean {
    if (unrouted.size === 0) return false;
    let seed = -1;
    let seedDist = -Infinity;
    for (const idx of unrouted) {
      const d = distToDepot(idx);
      if (d > seedDist) { seedDist = d; seed = idx; }
    }
    if (seed === -1) return false;
    routes.push([seed]);
    unrouted.delete(seed);
    return true;
  }

  function bestInsertion(route: number[], u: number): { pos: number; cost: number } | null {
    let bestPos = -1;
    let bestCost = Infinity;
    for (let pos = 0; pos <= route.length; pos++) {
      const i = pos === 0 ? 0 : route[pos - 1];
      const j = pos === route.length ? 0 : route[pos];
      const c1 = distBetween(i, u) + distBetween(u, j) - distBetween(i, j);
      const candidate = [...route.slice(0, pos), u, ...route.slice(pos)];
      if (checkRouteFeasible(candidate, nodes, params) && c1 < bestCost) {
        bestCost = c1;
        bestPos = pos;
      }
    }
    return bestPos === -1 ? null : { pos: bestPos, cost: bestCost };
  }

  seedNewRoute();

  while (unrouted.size > 0) {
    let chosenCustomer = -1;
    let chosenRouteIdx = -1;
    let chosenPos = -1;
    let bestRegret = -Infinity;

    for (const u of unrouted) {
      let bestForU: { routeIdx: number; pos: number; cost: number } | null = null;
      for (let r = 0; r < routes.length; r++) {
        const insertion = bestInsertion(routes[r], u);
        if (insertion && (!bestForU || insertion.cost < bestForU.cost)) {
          bestForU = { routeIdx: r, pos: insertion.pos, cost: insertion.cost };
        }
      }
      if (bestForU) {
        const regret = distToDepot(u) - bestForU.cost;
        if (regret > bestRegret) {
          bestRegret = regret;
          chosenCustomer = u;
          chosenRouteIdx = bestForU.routeIdx;
          chosenPos = bestForU.pos;
        }
      }
    }

    if (chosenCustomer === -1) {
      if (!seedNewRoute()) break;
      continue;
    }

    const route = routes[chosenRouteIdx];
    routes[chosenRouteIdx] = [...route.slice(0, chosenPos), chosenCustomer, ...route.slice(chosenPos)];
    unrouted.delete(chosenCustomer);
  }

  return routes;
}
```

Note on `bestInsertion`: it tries every position `0..route.length` (before the first stop, between each pair, after the last stop — `i`/`j` fall back to `0`, the depot sentinel, at the two ends, matching the existing `routeDistance` helper's convention). It returns the minimum-cost feasible position, or `null` if splicing `u` in anywhere in this route breaks capacity or a time window (per the reused `checkRouteFeasible`).

Note on the main loop: each pass finds, across *all* unrouted customers and *all* open routes, the single best `(customer, route, position)` triple by regret and commits only that one — this mirrors the classic I1 heuristic's re-evaluation-every-round behavior (inserting one customer changes what's feasible for others in that same route). If no unrouted customer has a feasible slot in any open route, `seedNewRoute()` opens a new one and the loop retries.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/algorithms.test.ts -t solomonI1`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full existing test suite and typecheck**

Run: `npx vitest run src/lib/algorithms.test.ts`
Expected: PASS (all describe blocks green, including the new `solomonI1` block)

Run: `npx tsc --noEmit -p .`
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/algorithms.ts src/lib/algorithms.test.ts
git commit -m "feat: add Solomon I1 insertion heuristic

Construction heuristic that seeds routes from the farthest customer
and inserts remaining customers by highest regret (distance-from-
depot minus cheapest feasible insertion cost), so far/hard-to-place
customers get routed before they become infeasible. Capacity/time-
window feasibility reuses the existing checkRouteFeasible."
```

---

### Task 2: Wire `solomonI1` into `ProcessingParams` and `buildRoutes()`

**Files:**
- Modify: `src/types.ts:53` (the `ProcessingParams.algorithm` union)
- Modify: `src/lib/geo.ts:10` (import) and the `buildRoutes()` switch (around line 221-226, inside `processData`)

**Interfaces:**
- Consumes: `solomonI1` from `./algorithms` (Task 1)
- Produces: `ProcessingParams.algorithm` now accepts `'solomon-i1'` — consumed by Task 3 (`App.tsx`)

- [ ] **Step 1: Update the type union**

In `src/types.ts`, line 53, change:

```ts
  algorithm: 'savings' | 'nearest-neighbor' | 'sweep' | 'or-opt-sa';
```
to:
```ts
  algorithm: 'savings' | 'nearest-neighbor' | 'sweep' | 'or-opt-sa' | 'solomon-i1';
```

- [ ] **Step 2: Import and dispatch in `geo.ts`**

In `src/lib/geo.ts`, line 10, change:

```ts
import { clarkWrightSavings, nearestNeighbor, sweep, twoOpt, orOptAnnealing } from './algorithms';
```
to:
```ts
import { clarkWrightSavings, nearestNeighbor, sweep, twoOpt, orOptAnnealing, solomonI1 } from './algorithms';
```

Find the `buildRoutes()` function inside `processData` (the switch on `params.algorithm`, currently reading):

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

Add a case for `'solomon-i1'`:

```ts
  function buildRoutes(): number[][] {
    switch (params.algorithm) {
      case 'nearest-neighbor': return nearestNeighbor(nodes, params);
      case 'sweep': return sweep(nodes, params);
      case 'or-opt-sa': return orOptAnnealing(nodes, params);
      case 'solomon-i1': return solomonI1(nodes, params);
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
git commit -m "feat: wire solomon-i1 into ProcessingParams and buildRoutes dispatch"
```

---

### Task 3: Add the 8th and 9th comparison variants in `App.tsx`

**Files:**
- Modify: `src/App.tsx:66-90` (the `variants` array and `labels` map inside `handleCompareAll`)

**Interfaces:**
- Consumes: `ProcessingParams.algorithm` now includes `'solomon-i1'` (Task 2)
- Produces: `comparisonData` (state, unchanged type `ComparisonResult[]`) now has 9 rows instead of 7 whenever `handleCompareAll` runs — consumed by the existing `AlgorithmComparison.tsx` (no changes needed there; it already renders any number of rows generically and Solomon I1 uses the standard `✓`/`—` 2-opt display, not the special-cased "built-in" text reserved for `'Or-opt + SA'`).

- [ ] **Step 1: Add the two variants and label**

In `src/App.tsx`, update the `variants` array type and contents (lines 66-73):

```ts
    const variants: { algorithm: 'savings' | 'nearest-neighbor' | 'sweep' | 'or-opt-sa' | 'solomon-i1'; applyTwoOpt: boolean }[] = [
      { algorithm: 'savings', applyTwoOpt: false },
      { algorithm: 'savings', applyTwoOpt: true },
      { algorithm: 'nearest-neighbor', applyTwoOpt: false },
      { algorithm: 'nearest-neighbor', applyTwoOpt: true },
      { algorithm: 'sweep', applyTwoOpt: false },
      { algorithm: 'sweep', applyTwoOpt: true },
      { algorithm: 'or-opt-sa', applyTwoOpt: false },
      { algorithm: 'solomon-i1', applyTwoOpt: false },
      { algorithm: 'solomon-i1', applyTwoOpt: true },
    ];
```

Update the `labels` map (lines 86-90):

```ts
    const labels: Record<string, string> = {
      savings: 'Clarke-Wright',
      'nearest-neighbor': 'Nearest Neighbor',
      sweep: 'Sweep',
      'or-opt-sa': 'Or-opt + SA',
      'solomon-i1': 'Solomon I1',
    };
```

No other changes needed in `App.tsx` — the existing `Promise.allSettled(variants.map(...))` loop, `comparison.push(...)`, and auto-select-best-cost logic are generic over the variants array and require no modification.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no new errors

- [ ] **Step 3: Manual verification — run the dev server and upload a real test file**

Run: `npm run dev` (background, use a port not already in use, e.g. `npm run dev -- --port=3002`)

Using the Playwright MCP tools, navigate to the dev server URL, upload one of the repo's real test manifests (e.g. `Test custom พัทยา.csv`), submit the routing-parameters modal, and confirm the Algorithm Comparison popup/table shows **9 rows**, with two labeled "Solomon I1" (one showing `—` and one showing `✓` in the 2-opt column, matching Clarke-Wright/Nearest Neighbor/Sweep's pattern — not "built-in").

Expected: table renders 9 rows, no console errors, both "Solomon I1" rows have plausible (non-zero, non-NaN) Distance/Cost/CO2/Trucks values.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add Solomon I1 as 8th and 9th comparison variants"
```

---

### Task 4: Full regression pass

**Files:** none modified — verification only

**Interfaces:** none

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all describe blocks across `algorithms.test.ts` green.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Manual end-to-end pass on all three real test manifests**

With `npm run dev` running, upload each of the three repo-root CSVs in turn (`Test custom บางแสน.csv`, `Test custom พัทยา.csv`, `Test custom ศรีราชา.csv`), and for each confirm:
- Algorithm Comparison table/popup shows 9 rows with no NaN/undefined values, two of them "Solomon I1".
- Dashboard, Carbon Footprint, and Statistics Car tabs render without errors when viewing either Solomon I1 row (click its "View" button from the popup or the inline tab).
- No new console errors appear (`browser_console_messages` if using Playwright MCP).

- [ ] **Step 4: Clean up any test artifacts**

If any temporary CSV copies or Playwright output were placed in `.playwright-mcp/` for browser testing, remove them:

```bash
rm -rf .playwright-mcp
```

(No commit needed for this step — it's cleanup of untracked test scratch files, not a repo change.)
