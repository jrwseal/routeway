# Or-opt + Simulated Annealing (OR-Tools-Inspired) Design

**Date:** 2026-07-03
**Status:** Approved

## Overview

Add a 7th algorithm variant to the Algorithm Comparison feature: a client-side local-search
heuristic inspired by Google OR-Tools' routing solver. Google OR-Tools itself is a C++/Python
library with no browser binding — this app has no backend, so a real OR-Tools call is out of
scope. Instead this implements the technique OR-Tools relies on that the existing algorithms
lack: **inter-route relocation** (moving customers between trucks after initial construction),
combined with simulated annealing to escape local optima that pure greedy improvement gets
stuck in.

The existing `twoOpt()` only reorders customers *within* a single route. None of the current
algorithms (Clarke-Wright Savings, Nearest Neighbor, Sweep) ever move a customer from one
truck's route to another's after construction. That's the gap this closes.

## Architecture

### Modified: `src/lib/algorithms.ts`

`checkConstraints` is currently a closure private to `clarkWrightSavings`. Lift it to
module scope so both functions can share it:

```ts
function checkRouteFeasible(routeSeq: number[], nodes: RouteNode[], params: ProcessingParams): boolean
// Same logic as today's private checkConstraints: validates capacity (maxCapacity)
// AND time-window (ready/due time) feasibility for a full route sequence.
```

New exported function:

```ts
export function orOptAnnealing(nodes: RouteNode[], params: ProcessingParams): number[][]
```

Algorithm:
1. **Seed**: `let routes = clarkWrightSavings(nodes, params)` — reuses the existing
   construction heuristic, which already produces the best baseline distance/truck-count
   in real test data and respects time windows out of the box.
2. **Cost function**: `routeCost(routeSeq)` sums `getFallbackDist` (haversine) over
   depot → ... → depot legs. `totalCost(routes)` sums across all routes. This mirrors the
   distance metric `twoOpt` already uses — synchronous, no network calls.
3. **Annealing loop**, fixed `ITERATIONS = 500`:
   - Temperature schedule: `T0` = current `totalCost(routes) / nodes.length` (scales to
     problem size), cooling `T *= 0.99` per iteration (reaches ~0.6% of T0 by iteration 500).
   - Each iteration:
     a. Pick a random source route with ≥1 customer, a random segment length (1-3, capped
        to route length), and a random start position within it.
     b. Pick a random target route (may be the same route) and a random insertion index.
     c. Build a candidate `routes` array with the segment removed from source and
        inserted at the target position.
     d. Validate: both the modified source route and modified target route must pass
        `checkRouteFeasible` (capacity + time window). If either fails, reject the move
        and continue to the next iteration (no cost/temperature update).
     e. Compute `delta = totalCost(candidate) - totalCost(routes)`.
     f. Accept if `delta < 0`, or probabilistically accept if
        `Math.random() < Math.exp(-delta / T)`.
     g. If accepted, `routes = candidate`. Independently, if `totalCost(candidate) <
        totalCost(bestRoutes)`, update `bestRoutes = candidate` (best-seen tracked
        separately from the current annealing state, since SA can wander to worse
        solutions after finding a good one).
4. **Final cleanup**: `bestRoutes = bestRoutes.map(r => twoOpt(r, nodes))` — one more
   intra-route pass in case relocations left a route in a locally-improvable order.
5. Return `bestRoutes`.

Empty-route edge case: if a relocation empties the source route, drop it from the
candidate array (a route with 0 customers is not a valid entry in `number[][]`).

### Modified: `src/types.ts`

```ts
export interface ProcessingParams {
  // existing fields...
  algorithm: 'savings' | 'nearest-neighbor' | 'sweep' | 'or-opt-sa';
}
```

`ComparisonResult` is unchanged (already generic over `algorithm: string`).

### Modified: `src/lib/geo.ts`

`buildRoutes()` switch gains one case:

```ts
case 'or-opt-sa': return orOptAnnealing(nodes, params);
```

No other changes to `processData()` — leg/cost/CO2 computation downstream is identical
for every algorithm.

### Modified: `src/App.tsx`

`handleCompareAll`'s `variants` array gains **one** entry (not two — see below):

```ts
{ algorithm: 'or-opt-sa', applyTwoOpt: false },
```

`labels` map gains: `'or-opt-sa': 'Or-opt + SA'`.

Total variants goes from 6 to 7.

**No separate 2-opt-toggle row for this algorithm.** Unlike the other three, `orOptAnnealing`
already performs local search (relocation + a final `twoOpt` pass) as an inherent part of
the algorithm — running the outer `applyTwoOpt` pass a second time would be redundant and
would misrepresent it as a meaningfully different variant. It gets one row, always with
local search included.

### Modified: `src/components/AlgorithmComparison.tsx`

The "2-opt" column currently renders `✓` / `—` from `row.twoOpt`. Add a special case: when
`row.algorithm === 'Or-opt + SA'`, render `built-in` instead, so it doesn't read as "this
variant skipped local search" (it didn't — 2-opt and relocation are baked in).

The `savingsBaseline` lookup (`data.find(r => r.algorithm === 'Clarke-Wright' && !r.twoOpt)`)
is unaffected — Clarke-Wright Savings stays the baseline for the "vs Savings" column;
Or-opt + SA is just another row compared against it like Nearest Neighbor and Sweep are.

### Disclosure text update

`AlgorithmComparison.tsx`'s caption currently reads: *"Time window compliance (Due_Time) is
only guaranteed with Clarke-Wright Savings."* Update to: *"Time window compliance (Due_Time)
is guaranteed with Clarke-Wright Savings and Or-opt + SA."* — accurate now that
`checkRouteFeasible` validates every relocation move.

## Data Flow

```
CSV upload → params modal → Compare All
  → Promise.allSettled([processData × 7])   // was ×6
    → processData(nodes, { algorithm: 'or-opt-sa', applyTwoOpt: false, ... })
      → buildRoutes() → orOptAnnealing(nodes, params)
        → clarkWrightSavings() seed
        → 500-iteration relocate + SA loop (capacity + time-window checked per move)
        → final twoOpt() cleanup per route
      → same downstream leg/cost/CO2/comparison logic as every other algorithm
  → comparisonData (7 rows) → Algorithm Comparison tab
```

## Performance

500 iterations, each doing O(1) segment extraction plus a `checkRouteFeasible` call whose
cost is O(route length) — bounded by total customer count. Uses only `getFallbackDist`
(synchronous haversine), never the async OSRM `getRoute()` calls used later for the final
rendered legs. For the real test datasets on hand (16-17 stops), this is well under a
second and does not block the UI meaningfully longer than the existing 6 variants already do.

## Error Handling

- Same pattern as existing algorithms: if `orOptAnnealing` throws or produces routes that
  fail downstream processing, `Promise.allSettled` in `handleCompareAll` catches it —
  logged to console, excluded from the comparison table, not fatal to the other 6 variants.
- If every relocation attempt is rejected for the full 500 iterations (fully constrained
  problem), `bestRoutes` simply stays equal to the Clarke-Wright seed — a safe no-op, not
  an error.

## Constraints Preserved

Same as the other three algorithms:
- Vehicle capacity (CBM) — checked via `checkRouteFeasible` on every candidate move.
- Time windows (ready/due time) — checked via `checkRouteFeasible` on every candidate move
  (this is new: relocation moves are the first place other than Savings' construction that
  validate time windows before accepting a change).
- Fleet pool assignment — unaffected; vehicle assignment happens downstream in
  `processData`, identical for all algorithms.

## Testing

Add a case to `src/lib/algorithms.test.ts` mirroring the existing `nearestNeighbor`/`sweep`
tests: run `orOptAnnealing` on the existing test fixture, assert:
- Every node index appears in exactly one route (no duplicates, none dropped).
- No route exceeds `maxCapacity`.
- No route violates a due-time (using the same feasibility check the algorithm itself uses).

## Out of Scope

- Real Google OR-Tools (Python/C++) — would require a backend service; explicitly rejected
  in favor of the JS-native heuristic for this iteration.
- Configurable iteration count / temperature schedule via UI — fixed constants, no new
  params-modal controls.
- Exchange moves (swapping two segments between routes) — only one-directional relocation
  is implemented; exchange is a possible future extension, not needed to close the gap
  identified (inter-route movement at all, vs. none today).
- Or-opt variant that skips the final `twoOpt` cleanup pass.
