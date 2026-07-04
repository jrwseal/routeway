# Solomon I1 Insertion Heuristic — Design

**Goal:** Add an 8th algorithm variant, `solomonI1`, to the Algorithm Comparison feature — a VRPTW-specific construction heuristic that (unlike Clarke-Wright's distance-only savings merge) prioritizes inserting time-sensitive/far customers first, via Solomon's (1987) I1 insertion criterion.

## Algorithm

New `export function solomonI1(nodes: RouteNode[], params: ProcessingParams): number[][]` in `src/lib/algorithms.ts`, same shape/style as the existing `clarkWrightSavings`.

**Seeding a new route:** the unrouted customer farthest (straight-line, via `getFallbackDist`) from the depot.

**Insertion loop**, repeated until all customers are routed:
1. For every unrouted customer `u` and every open route, find the cheapest feasible insertion position `(i, j)` (adjacent stops in that route, or depot-adjacent at the ends) using:
   ```
   c1(i, u, j) = d(i, u) + d(u, j) - d(i, j)
   ```
   (fixed parameters: α1=1, α2=0, μ=1 — the classic distance-only I1 parameterization; no time-push term, no new UI controls, matching the "fixed params" precedent already established for `orOptAnnealing`.)
2. A candidate position is feasible only if splicing `u` into that route at that position still passes the existing `checkRouteFeasible` (capacity + time-window) — reused, not reimplemented.
3. Among all customers that have at least one feasible position anywhere, select the one with the highest "regret" score:
   ```
   c2(u) = d(depot, u) - c1_best(u)
   ```
   and insert it at its best-found position. This is the mechanism that prioritizes far/tightly-windowed customers before they become impossible to place later.
4. If no unrouted customer has any feasible position in any open route, start a new route seeded per the rule above.

All distances use the existing synchronous `getFallbackDist` — never the async `getRoute()`.

## Integration

Same wiring pattern as Clarke-Wright/Nearest Neighbor/Sweep (not Or-opt+SA):
- `ProcessingParams.algorithm` (`src/types.ts`) gets `'solomon-i1'` added to the union.
- `src/lib/geo.ts`'s `buildRoutes()` dispatches to `solomonI1` for that case.
- `src/App.tsx`'s `variants` array gets **two** entries — `{ algorithm: 'solomon-i1', applyTwoOpt: false }` and `{ algorithm: 'solomon-i1', applyTwoOpt: true }` — and a `'Solomon I1'` label, exactly like the three existing construction heuristics. This is two new comparison-table rows, not one "built-in" row (that pattern is reserved for `orOptAnnealing`, which does its own local-search cleanup; Solomon I1 only constructs routes).

## Known Limitation (inherited, out of scope for this change)

The 2-opt-on row for this algorithm flows through `geo.ts`'s existing `if (params.applyTwoOpt) routes = routes.map(r => twoOpt(r, nodes))` — a raw `twoOpt` call without the `twoOptFeasible` guard that `orOptAnnealing` uses internally. This means, like the existing Clarke-Wright/Nearest Neighbor/Sweep 2-opt rows today, it can theoretically reintroduce a time-window violation after construction. This is a pre-existing gap shared by every 2-opt-toggle row in the app, not something this change introduces; fixing it (if wanted) is a separate, broader task touching `geo.ts`'s shared post-processing step, not this algorithm addition.

## Testing

New tests in `src/lib/algorithms.test.ts`, mirroring the existing style for `clarkWrightSavings`/`orOptAnnealing`:
- Covers all customer nodes exactly once.
- No route exceeds max capacity.
- Every route is time-window feasible (`checkRouteFeasible` on the result).
- Produces a result no worse (by total distance) than a trivial single-route-per-customer baseline, and ideally demonstrates better time-window handling than Clarke-Wright on a fixture with a customer that Clarke-Wright's savings order would otherwise strand (a tight due-time customer far from the depot, inserted late by pure distance-savings but prioritized early by I1's regret ordering).
