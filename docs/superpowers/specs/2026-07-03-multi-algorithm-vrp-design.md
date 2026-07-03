# Multi-Algorithm VRP Design

**Date:** 2026-07-03
**Status:** Approved

## Overview

Add Nearest Neighbor, Sweep, and 2-opt post-processing algorithms alongside the existing Clarke-Wright Savings algorithm. Users select an algorithm (or Compare All) before calculating routes.

## Architecture

### New file: `src/lib/algorithms.ts`

Contains three pure functions with no external dependencies:

```ts
nearestNeighbor(nodes, params): number[][]
// Returns array of route sequences (indices into nodes[])
// Greedy: depot → nearest unvisited node, repeat until capacity exhausted, start new route

sweep(nodes, params): number[][]
// Returns array of route sequences
// Sort customer nodes by polar angle from depot, pack into routes respecting capacity

twoOpt(route: number[], nodes, params): number[]
// Improves a single route sequence by trying all (i,j) segment reversals
// Returns improved route sequence
```

All functions accept the same `nodes: RouteNode[]` and relevant `params` fields. They return route sequences only — no leg/cost/CO2 computation (that stays in `processData`).

### Modified: `src/lib/geo.ts`

`processData()` gains two new params:

```ts
export interface ProcessingParams {
  // existing fields...
  algorithm: 'savings' | 'nearest-neighbor' | 'sweep'
  applyTwoOpt: boolean
}
```

Route-building section replaced with:
```ts
const routes = buildRoutes(nodes, params) // dispatches to algorithm
const refinedRoutes = params.applyTwoOpt
  ? routes.map(r => twoOpt(r, nodes, params))
  : routes
```

Existing leg/cost/CO2 computation downstream is unchanged.

### Modified: `src/App.tsx`

`ProcessingParams` state gains `algorithm` and `applyTwoOpt` fields. Params modal gets:
- Dropdown: Algorithm selector (Clarke-Wright / Nearest Neighbor / Sweep)
- Checkbox: "Refine with 2-opt"
- Button: "Compare All" — runs all 3 algorithms (+ 2-opt variants = up to 6 runs) in parallel via `Promise.all`

Compare All result stored in `comparisonData: ComparisonResult[]`.

### New type: `ComparisonResult`

```ts
interface ComparisonResult {
  algorithm: string
  twoOpt: boolean
  milkRunDistance: number
  milkRunCost: number
  milkRunCO2: number
  savingsPercentage: number
  totalTrucksUsed: number
}
```

### New tab: `src/components/AlgorithmComparison.tsx`

Shows comparison table. Columns: Algorithm | Distance (km) | Cost (฿) | CO2 (kg) | Trucks | Savings%. Best row per metric highlighted with green background. Visible only when `comparisonData` is populated.

Sidebar gains new nav item: "Algorithm Comparison" (disabled until comparisonData exists).

## Data Flow

```
CSV upload → params modal (algorithm + 2-opt + Compare All)
  → single run: processData(nodes, params) → processedData
  → compare all: Promise.all([processData × 6]) → comparisonData
    → auto-select best (lowest cost) as processedData for detail views
```

## Error Handling

- 2-opt skipped (not errored) if route has fewer than 4 nodes
- Sweep falls back to Nearest Neighbor if no nodes have valid lat/lon polar angles
- Compare All: individual algorithm failures logged to console, excluded from table (not fatal)

## Constraints Preserved

All three algorithms respect the same constraints as Clarke-Wright:
- Vehicle capacity (CBM)
- Time windows (ready/due time)
- Fleet pool assignment

## Out of Scope

- Genetic / metaheuristic algorithms
- Per-algorithm tuning parameters
- Saving/exporting comparison results
