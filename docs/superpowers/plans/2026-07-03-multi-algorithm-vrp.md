# Multi-Algorithm VRP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Nearest Neighbor, Sweep, and 2-opt algorithms to RouteWay Intelligence alongside Clarke-Wright Savings, with an algorithm selector in the params modal and a Compare All mode.

**Architecture:** Extract route-building logic from `geo.ts` into a new `algorithms.ts` module with pure functions. `processData()` dispatches to the chosen algorithm via a `buildRoutes()` wrapper, then applies 2-opt post-processing if requested. A new `AlgorithmComparison` tab shows side-by-side results for all variants.

**Tech Stack:** React 19, TypeScript, Vite 6, Tailwind v4, Vitest (added), lucide-react

## Global Constraints

- TypeScript strict mode — no `any` except where type is genuinely unknown (existing pattern: `row: any` in CSV parsing)
- Tailwind v4 utility classes only — no arbitrary CSS files
- Existing color palette: `#1E3A8A` (primary blue), `#10B981` (green), `#F97316` (orange), `#EF4444` (red), `bg-[#F8FAFC]` (page bg)
- All route-building functions return `number[][]` — indices into `nodes[]`, where `nodes[0]` is always the depot
- No external routing calls (no `getRoute`/OSRM) inside algorithm functions — use `getFallbackDist` (synchronous Haversine) for all distance comparisons within algorithms

---

### Task 1: Types + Vitest Setup

**Files:**
- Modify: `src/types.ts`
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `ProcessingParams.algorithm`, `ProcessingParams.applyTwoOpt`, `ComparisonResult` — consumed by Tasks 2, 3, 4, 5

- [ ] **Step 1: Add algorithm fields to `ProcessingParams` and new `ComparisonResult` type in `src/types.ts`**

Replace the existing `ProcessingParams` interface and add `ComparisonResult` after it:

```typescript
export interface ProcessingParams {
  fleetPool: Vehicle[];
  avgSpeed: number;
  startTime: Date;
  driverWage: number;
  fuelPrice4W: number;
  fuelPrice6W: number;
  fuelPrice10W: number;
  algorithm: 'savings' | 'nearest-neighbor' | 'sweep';
  applyTwoOpt: boolean;
}

export interface ComparisonResult {
  algorithm: string;
  twoOpt: boolean;
  milkRunDistance: number;
  milkRunCost: number;
  milkRunCO2: number;
  savingsPercentage: number;
  totalTrucksUsed: number;
}
```

- [ ] **Step 2: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Add test script to `package.json`**

In `package.json` scripts, add:
```json
"test": "vitest run"
```

- [ ] **Step 5: Verify vitest runs (no tests yet)**

```bash
npm test
```

Expected: `No test files found` or similar — no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts package.json package-lock.json vitest.config.ts
git commit -m "feat: add algorithm types and vitest setup"
```

---

### Task 2: `src/lib/algorithms.ts` — Pure Route-Building Functions

**Files:**
- Create: `src/lib/algorithms.ts`
- Create: `src/lib/algorithms.test.ts`

**Interfaces:**
- Consumes: `RouteNode`, `ProcessingParams` from `src/types.ts`; `getFallbackDist` from `src/lib/geo.ts`
- Produces:
  - `clarkWrightSavings(nodes: RouteNode[], params: ProcessingParams): number[][]`
  - `nearestNeighbor(nodes: RouteNode[], params: ProcessingParams): number[][]`
  - `sweep(nodes: RouteNode[], params: ProcessingParams): number[][]`
  - `twoOpt(route: number[], nodes: RouteNode[]): number[]`

- [ ] **Step 1: Write failing tests in `src/lib/algorithms.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { nearestNeighbor, sweep, twoOpt } from './algorithms';
import type { RouteNode, ProcessingParams } from '../types';

const depot: RouteNode = {
  id: 0, location: 'Depot', lat: 13.7, lon: 100.5,
  demandVolume: 0, weight: 0, readyTime: null, dueTime: null,
};
const makeNode = (id: number, lat: number, lon: number, vol: number): RouteNode => ({
  id, location: `Node${id}`, lat, lon,
  demandVolume: vol, weight: 0, readyTime: null, dueTime: null,
});

const baseParams: ProcessingParams = {
  fleetPool: [{ id: 'v1', type: '4-wheel', name: 'Truck', capacityCBM: 20, fuelConsumption: 0.12, color: '#10B981' }],
  avgSpeed: 50,
  startTime: new Date('2024-01-01T08:00:00'),
  driverWage: 60,
  fuelPrice4W: 35,
  fuelPrice6W: 35,
  fuelPrice10W: 35,
  algorithm: 'nearest-neighbor',
  applyTwoOpt: false,
};

const nodes: RouteNode[] = [
  depot,
  makeNode(1, 13.8, 100.5, 5),
  makeNode(2, 13.6, 100.5, 5),
  makeNode(3, 13.7, 100.6, 5),
  makeNode(4, 13.7, 100.4, 5),
];

describe('nearestNeighbor', () => {
  it('covers all customer nodes', () => {
    const routes = nearestNeighbor(nodes, baseParams);
    const allIdx = routes.flat().sort((a, b) => a - b);
    expect(allIdx).toEqual([1, 2, 3, 4]);
  });

  it('no route exceeds max capacity', () => {
    const routes = nearestNeighbor(nodes, baseParams);
    for (const route of routes) {
      const vol = route.reduce((s, i) => s + nodes[i].demandVolume, 0);
      expect(vol).toBeLessThanOrEqual(20);
    }
  });

  it('no route contains depot index (0)', () => {
    const routes = nearestNeighbor(nodes, baseParams);
    for (const route of routes) {
      expect(route).not.toContain(0);
    }
  });
});

describe('sweep', () => {
  it('covers all customer nodes', () => {
    const routes = sweep(nodes, baseParams);
    const allIdx = routes.flat().sort((a, b) => a - b);
    expect(allIdx).toEqual([1, 2, 3, 4]);
  });

  it('no route exceeds max capacity', () => {
    const routes = sweep(nodes, baseParams);
    for (const route of routes) {
      const vol = route.reduce((s, i) => s + nodes[i].demandVolume, 0);
      expect(vol).toBeLessThanOrEqual(20);
    }
  });
});

describe('twoOpt', () => {
  it('returns same nodes in different order (no nodes added or removed)', () => {
    const route = [1, 3, 2, 4];
    const result = twoOpt(route, nodes);
    expect(result.slice().sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('returns original route unchanged when fewer than 4 nodes', () => {
    const route = [1, 2, 3];
    expect(twoOpt(route, nodes)).toEqual([1, 2, 3]);
  });

  it('does not increase total route distance', () => {
    // sub-optimal order: 1→3→2→4 vs better orders
    const before = [1, 3, 2, 4];
    const after = twoOpt(before, nodes);
    const dist = (r: number[]) => {
      let d = 0;
      const full = [0, ...r, 0];
      for (let i = 0; i < full.length - 1; i++) {
        const a = nodes[full[i]], b = nodes[full[i + 1]];
        d += Math.hypot(a.lat - b.lat, a.lon - b.lon);
      }
      return d;
    };
    expect(dist(after)).toBeLessThanOrEqual(dist(before) + 0.001);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test
```

Expected: `Cannot find module './algorithms'`

- [ ] **Step 3: Create `src/lib/algorithms.ts` with all four functions**

```typescript
import { getFallbackDist } from './geo';
import type { RouteNode, ProcessingParams } from '../types';

function getMaxCapacity(params: ProcessingParams): number {
  return params.fleetPool.length > 0
    ? Math.max(...params.fleetPool.map(v => v.capacityCBM))
    : Infinity;
}

function nodeVol(node: RouteNode): number {
  return isNaN(node.demandVolume) ? 0 : node.demandVolume;
}

export function clarkWrightSavings(nodes: RouteNode[], params: ProcessingParams): number[][] {
  const depot = nodes[0];
  const maxCapacity = getMaxCapacity(params);

  const checkConstraints = (routeSeq: number[]): boolean => {
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
  };

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
      if (checkConstraints(proposed)) {
        routes = routes.filter((_, idx) => idx !== routeIIdx && idx !== routeJIdx);
        routes.push(proposed);
      }
    }
  }
  return routes;
}

export function nearestNeighbor(nodes: RouteNode[], params: ProcessingParams): number[][] {
  const maxCapacity = getMaxCapacity(params);
  const unvisited = new Set<number>();
  for (let i = 1; i < nodes.length; i++) unvisited.add(i);

  const routes: number[][] = [];

  while (unvisited.size > 0) {
    const route: number[] = [];
    let routeVolume = 0;
    let currentIdx = 0;

    while (true) {
      let bestIdx = -1;
      let bestDist = Infinity;

      for (const idx of unvisited) {
        const vol = nodeVol(nodes[idx]);
        if (routeVolume + vol > maxCapacity) continue;
        const dist = getFallbackDist(
          [nodes[currentIdx].lon, nodes[currentIdx].lat],
          [nodes[idx].lon, nodes[idx].lat]
        );
        if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
      }

      if (bestIdx === -1) break;
      routeVolume += nodeVol(nodes[bestIdx]);
      route.push(bestIdx);
      unvisited.delete(bestIdx);
      currentIdx = bestIdx;
    }

    if (route.length > 0) routes.push(route);
    else {
      // Remaining nodes can't fit any vehicle — assign each individually
      for (const idx of unvisited) routes.push([idx]);
      break;
    }
  }

  return routes;
}

export function sweep(nodes: RouteNode[], params: ProcessingParams): number[][] {
  const maxCapacity = getMaxCapacity(params);
  const depot = nodes[0];

  const customers = [];
  for (let i = 1; i < nodes.length; i++) {
    const angle = Math.atan2(nodes[i].lat - depot.lat, nodes[i].lon - depot.lon);
    customers.push({ idx: i, angle });
  }
  customers.sort((a, b) => a.angle - b.angle);

  const routes: number[][] = [];
  let route: number[] = [];
  let routeVolume = 0;

  for (const { idx } of customers) {
    const vol = nodeVol(nodes[idx]);
    if (routeVolume + vol > maxCapacity && route.length > 0) {
      routes.push(route);
      route = [];
      routeVolume = 0;
    }
    route.push(idx);
    routeVolume += vol;
  }
  if (route.length > 0) routes.push(route);
  return routes;
}

export function twoOpt(route: number[], nodes: RouteNode[]): number[] {
  if (route.length < 4) return route;

  let best = [...route];
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 2; j < best.length; j++) {
        const ni = nodes[best[i]], ni1 = nodes[best[i + 1]];
        const nj = nodes[best[j]];
        const nj1 = j + 1 < best.length ? nodes[best[j + 1]] : nodes[0];

        const ci: [number, number] = [ni.lon, ni.lat];
        const ci1: [number, number] = [ni1.lon, ni1.lat];
        const cj: [number, number] = [nj.lon, nj.lat];
        const cj1: [number, number] = [nj1.lon, nj1.lat];

        const current = getFallbackDist(ci, ci1) + getFallbackDist(cj, cj1);
        const swapped = getFallbackDist(ci, cj) + getFallbackDist(ci1, cj1);

        if (swapped < current - 0.001) {
          best = [
            ...best.slice(0, i + 1),
            ...best.slice(i + 1, j + 1).reverse(),
            ...best.slice(j + 1),
          ];
          improved = true;
        }
      }
    }
  }

  return best;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/algorithms.ts src/lib/algorithms.test.ts vitest.config.ts package.json package-lock.json
git commit -m "feat: add nearestNeighbor, sweep, twoOpt, clarkWrightSavings algorithms with tests"
```

---

### Task 3: Refactor `geo.ts` to Dispatch via Algorithm

**Files:**
- Modify: `src/lib/geo.ts`

**Interfaces:**
- Consumes: `clarkWrightSavings`, `nearestNeighbor`, `sweep`, `twoOpt` from `src/lib/algorithms.ts`
- Produces: `processData()` now accepts `algorithm` and `applyTwoOpt` in params (same return type `ProcessedData`)

- [ ] **Step 1: Add imports at top of `src/lib/geo.ts`**

After the existing imports, add:

```typescript
import { clarkWrightSavings, nearestNeighbor, sweep, twoOpt } from './algorithms';
```

- [ ] **Step 2: Replace the savings route-building block with algorithm dispatch**

In `processData`, find the section starting with the comment `// 1. CORE CLARKE-WRIGHT SAVINGS CALCULATION` and ending just before `// 3. BEST-FIT / GREEN FLEET SELECTION`. Replace that entire block (including the `checkConstraints` inner function and the route merging loop) with:

```typescript
  // 1. BUILD ROUTES via selected algorithm
  function buildRoutes(): number[][] {
    switch (params.algorithm) {
      case 'nearest-neighbor': return nearestNeighbor(nodes, params);
      case 'sweep': return sweep(nodes, params);
      default: return clarkWrightSavings(nodes, params);
    }
  }

  let routes = buildRoutes();
  if (params.applyTwoOpt) {
    routes = routes.map(r => twoOpt(r, nodes));
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/geo.ts
git commit -m "refactor: geo.ts dispatches route-building to algorithms module"
```

---

### Task 4: Params Modal UI — Algorithm Selector + Compare All

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ComparisonResult` from `src/types.ts`; `processData` from `src/lib/geo.ts`
- Produces: `algorithm`, `applyTwoOpt`, `comparisonData` state passed to `AlgorithmComparison` tab (Task 5)

- [ ] **Step 1: Add new state variables in `App.tsx`**

After the existing state declarations, add:

```typescript
  const [algorithm, setAlgorithm] = useState<'savings' | 'nearest-neighbor' | 'sweep'>('savings');
  const [applyTwoOpt, setApplyTwoOpt] = useState(false);
  const [comparisonData, setComparisonData] = useState<ComparisonResult[] | null>(null);
  const [isComparing, setIsComparing] = useState(false);
```

Add `ComparisonResult` to the import from `./types`:
```typescript
import { RouteNode, ProcessedData, ComparisonResult } from './types';
```

- [ ] **Step 2: Update `calculateRoutes` to pass algorithm params**

In `calculateRoutes`, update the `processData` call to include algorithm fields:

```typescript
      const data = await processData(pendingNodes, {
        fleetPool: activeFleetPool,
        avgSpeed,
        startTime: startDateTime,
        driverWage: driverWaitingWage,
        fuelPrice4W,
        fuelPrice6W,
        fuelPrice10W,
        algorithm,
        applyTwoOpt,
      });
```

- [ ] **Step 3: Add `handleCompareAll` function after `calculateRoutes`**

```typescript
  const handleCompareAll = async () => {
    if (!pendingNodes) return;
    setIsParamsModalOpen(false);
    setIsComparing(true);
    setCurrentStep(0);
    setStepState('pending');

    const todayStr = new Date().toISOString().split('T')[0];
    let startDateTime = new Date(`${todayStr} 08:00`);
    if (departureTimeStr) {
      const parts = departureTimeStr.split(':');
      if (parts.length >= 2) {
        startDateTime = new Date(`${todayStr} ${parts[0]}:${parts[1]}`);
      }
    }

    const variants: { algorithm: 'savings' | 'nearest-neighbor' | 'sweep'; applyTwoOpt: boolean }[] = [
      { algorithm: 'savings', applyTwoOpt: false },
      { algorithm: 'savings', applyTwoOpt: true },
      { algorithm: 'nearest-neighbor', applyTwoOpt: false },
      { algorithm: 'nearest-neighbor', applyTwoOpt: true },
      { algorithm: 'sweep', applyTwoOpt: false },
      { algorithm: 'sweep', applyTwoOpt: true },
    ];

    const baseParams = {
      fleetPool: activeFleetPool,
      avgSpeed,
      startTime: startDateTime,
      driverWage: driverWaitingWage,
      fuelPrice4W,
      fuelPrice6W,
      fuelPrice10W,
    };

    const labels: Record<string, string> = {
      savings: 'Clarke-Wright',
      'nearest-neighbor': 'Nearest Neighbor',
      sweep: 'Sweep',
    };

    const results = await Promise.allSettled(
      variants.map(v => processData(pendingNodes!, { ...baseParams, ...v }))
    );

    const comparison: ComparisonResult[] = [];
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        const v = variants[idx];
        const d = r.value;
        comparison.push({
          algorithm: labels[v.algorithm],
          twoOpt: v.applyTwoOpt,
          milkRunDistance: d.milkRunDistance,
          milkRunCost: d.milkRunCost,
          milkRunCO2: d.milkRunCO2,
          savingsPercentage: d.savingsPercentage,
          totalTrucksUsed: d.totalTrucksUsed,
        });
      } else {
        console.warn(`Algorithm variant ${idx} failed:`, r.reason);
      }
    });

    // Auto-select best result (lowest cost) for detail views
    if (comparison.length > 0) {
      const bestIdx = comparison.reduce((bi, c, i) => c.milkRunCost < comparison[bi].milkRunCost ? i : bi, 0);
      const bestVariant = variants[results.findIndex((r, i) => r.status === 'fulfilled' &&
        comparison.find(c => c.algorithm === labels[variants[i].algorithm] && c.twoOpt === variants[i].applyTwoOpt))];
      // Re-run best variant to get full ProcessedData for detail views
      try {
        const bestData = await processData(pendingNodes!, { ...baseParams, ...variants[bestIdx] });
        setProcessedData(bestData);
      } catch (e) {
        console.error('Best variant re-run failed', e);
      }
    }

    setComparisonData(comparison);
    setCurrentTab('comparison');
    setIsComparing(false);
  };
```

- [ ] **Step 4: Add algorithm selector, 2-opt checkbox, and Compare All button to params modal**

Inside the params modal `<div className="p-6 space-y-6">`, add these blocks after the existing "Departure Time" block:

```tsx
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">Algorithm</label>
                <select
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value as 'savings' | 'nearest-neighbor' | 'sweep')}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-[#1E3A8A] focus:outline-none bg-white"
                >
                  <option value="savings">Clarke-Wright Savings</option>
                  <option value="nearest-neighbor">Nearest Neighbor</option>
                  <option value="sweep">Sweep</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="twoopt"
                  type="checkbox"
                  checked={applyTwoOpt}
                  onChange={(e) => setApplyTwoOpt(e.target.checked)}
                  className="w-4 h-4 accent-[#1E3A8A]"
                />
                <label htmlFor="twoopt" className="text-sm font-semibold text-slate-700">
                  Refine with 2-opt
                </label>
              </div>
```

In the params modal footer `<div className="p-6 bg-slate-50 ... flex justify-end gap-3">`, add a Compare All button before the existing Calculate button:

```tsx
              <button
                onClick={handleCompareAll}
                disabled={!avgSpeed || avgSpeed <= 0 || !departureTimeStr}
                className="px-5 py-2.5 rounded-lg text-sm font-bold bg-[#1E3A8A] text-white hover:bg-blue-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Compare All
              </button>
```

- [ ] **Step 5: Show comparing spinner**

In the `isProcessing` ternary (the loading state block), update condition:

```tsx
        {(isProcessing || isComparing) ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-[#1E3A8A] animate-spin mb-4" />
            <h2 className="text-xl font-bold text-slate-700">
              {isComparing ? 'Running All Algorithms...' : 'Calculating Optimizer Engine...'}
            </h2>
            <p className="text-slate-500 mt-2">
              {isComparing ? 'Running 6 variants in parallel.' : 'Fetching live OSRM routes and modeling emissions.'}
            </p>
          </div>
```

Also add `comparisonData` to the `<>` tabs block:

```tsx
            {currentTab === 'comparison' && comparisonData && (
              <AlgorithmComparison data={comparisonData} />
            )}
```

Add import at top:
```typescript
import AlgorithmComparison from './components/AlgorithmComparison';
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add algorithm selector and Compare All to params modal"
```

---

### Task 5: `AlgorithmComparison.tsx` + Sidebar Nav Item

**Files:**
- Create: `src/components/AlgorithmComparison.tsx`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `ComparisonResult[]` from `src/types.ts`
- Produces: `AlgorithmComparison` component rendered at `currentTab === 'comparison'`

- [ ] **Step 1: Create `src/components/AlgorithmComparison.tsx`**

```typescript
import React from 'react';
import type { ComparisonResult } from '../types';

interface Props {
  data: ComparisonResult[];
}

function bestIdx(data: ComparisonResult[], key: keyof Pick<ComparisonResult, 'milkRunDistance' | 'milkRunCost' | 'milkRunCO2' | 'totalTrucksUsed'>): number {
  return data.reduce((bi, c, i) => (c[key] < data[bi][key] ? i : bi), 0);
}

function bestIdxMax(data: ComparisonResult[], key: keyof Pick<ComparisonResult, 'savingsPercentage'>): number {
  return data.reduce((bi, c, i) => (c[key] > data[bi][key] ? i : bi), 0);
}

export default function AlgorithmComparison({ data }: Props) {
  if (data.length === 0) return null;

  const bestDist = bestIdx(data, 'milkRunDistance');
  const bestCost = bestIdx(data, 'milkRunCost');
  const bestCO2 = bestIdx(data, 'milkRunCO2');
  const bestTrucks = bestIdx(data, 'totalTrucksUsed');
  const bestSavings = bestIdxMax(data, 'savingsPercentage');

  const colClass = (rowIdx: number, metricBest: number) =>
    rowIdx === metricBest
      ? 'bg-emerald-50 text-emerald-800 font-bold'
      : 'text-slate-700';

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-[#1E3A8A] mb-1">Algorithm Comparison</h2>
      <p className="text-sm text-slate-500 mb-6">Green cell = best value per metric. Detail views use the lowest-cost result.</p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[#1E3A8A] text-white">
              <th className="px-4 py-3 text-left font-semibold">Algorithm</th>
              <th className="px-4 py-3 text-left font-semibold">2-opt</th>
              <th className="px-4 py-3 text-right font-semibold">Distance (km)</th>
              <th className="px-4 py-3 text-right font-semibold">Cost (฿)</th>
              <th className="px-4 py-3 text-right font-semibold">CO₂ (kg)</th>
              <th className="px-4 py-3 text-right font-semibold">Trucks</th>
              <th className="px-4 py-3 text-right font-semibold">Savings %</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className={`border-t border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="px-4 py-3 font-medium text-slate-800">{row.algorithm}</td>
                <td className="px-4 py-3 text-slate-500">{row.twoOpt ? '✓' : '—'}</td>
                <td className={`px-4 py-3 text-right rounded ${colClass(i, bestDist)}`}>
                  {row.milkRunDistance.toFixed(1)}
                </td>
                <td className={`px-4 py-3 text-right rounded ${colClass(i, bestCost)}`}>
                  {row.milkRunCost.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                </td>
                <td className={`px-4 py-3 text-right rounded ${colClass(i, bestCO2)}`}>
                  {row.milkRunCO2.toFixed(1)}
                </td>
                <td className={`px-4 py-3 text-right rounded ${colClass(i, bestTrucks)}`}>
                  {row.totalTrucksUsed}
                </td>
                <td className={`px-4 py-3 text-right rounded ${colClass(i, bestSavings)}`}>
                  {row.savingsPercentage.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add "Algorithm Comparison" nav item to `src/components/Sidebar.tsx`**

In the `menuItems` array, add as the last entry:

```typescript
    { id: 'comparison', label: 'Algorithm Comparison', icon: <BarChart className="w-4 h-4 mr-2" /> },
```

(The `BarChart` icon is already imported.)

Update the `disabled` condition for this item only — it should be disabled until `comparisonData` exists. This requires passing `hasComparison` prop.

Update `SidebarProps`:
```typescript
interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onDataLoaded: (nodes: RouteNode[]) => void;
  isProcessing: boolean;
  hasData: boolean;
  hasComparison: boolean;
  avgSpeed: number;
  setAvgSpeed: (val: number) => void;
  setIsFleetConfigOpen: (isOpen: boolean) => void;
}
```

Update the `disabled` prop on the nav button:
```tsx
            disabled={item.id === 'comparison' ? !hasComparison : !hasData}
```

In `App.tsx`, pass the new prop to `<Sidebar>`:
```tsx
        hasComparison={comparisonData !== null}
```

- [ ] **Step 3: Run full build**

```bash
npm run build
```

Expected: build completes, only the existing chunk-size warning (no errors).

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/AlgorithmComparison.tsx src/components/Sidebar.tsx src/App.tsx
git commit -m "feat: add AlgorithmComparison tab and sidebar nav item"
```

- [ ] **Step 6: Push to GitHub**

```bash
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ `algorithms.ts` with nearestNeighbor, sweep, twoOpt
- ✅ `ProcessingParams.algorithm` + `applyTwoOpt`
- ✅ `buildRoutes()` dispatcher in `geo.ts`
- ✅ Algorithm selector dropdown in params modal
- ✅ 2-opt checkbox
- ✅ Compare All button → 6 variants via `Promise.allSettled`
- ✅ `ComparisonResult` type
- ✅ `AlgorithmComparison.tsx` with best-cell highlighting
- ✅ Sidebar nav item disabled until comparisonData exists
- ✅ Auto-select lowest-cost result for detail views
- ✅ Error handling: `Promise.allSettled` (individual failures excluded, not fatal); twoOpt skips routes < 4 nodes; sweep always produces routes

**Placeholder scan:** None found.

**Type consistency:** `ComparisonResult` defined in Task 1, consumed in Tasks 4 and 5. `clarkWrightSavings` / `nearestNeighbor` / `sweep` / `twoOpt` defined in Task 2, consumed in Task 3. `hasComparison` prop added to Sidebar in Task 5, wired in same task.
