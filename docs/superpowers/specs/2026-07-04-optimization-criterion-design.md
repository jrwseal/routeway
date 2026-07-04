# Optimization Criterion Selector — Design

**Goal:** Let the user choose which metric ("Min Cost", "Min CO2", "Min Distance") drives the auto-selected best-variant result, chosen before calculation, and surface the winning variant explicitly in the comparison view afterward.

## Placement

A new radio group in the existing "Set Routing Parameters" modal (`App.tsx`, the modal that appears after CSV upload, currently containing Average Speed and Departure Time). Three options: **Min Cost** (default, matches current behavior), **Min CO2**, **Min Distance**.

## Effect

The chosen criterion only changes which variant `handleCompareAll` auto-selects as `processedData` (the result shown on Dashboard/Carbon Footprint/Statistics/Driver Portal by default). It does **not** change the per-column green "best value" highlighting in the comparison table — every column keeps highlighting its own metric's minimum independent of the chosen criterion, exactly as today.

`handleCompareAll`'s existing auto-select block:
```ts
if (variantData.length > 0) {
  const bestIdx = comparison.reduce((bi, c, i) => c.milkRunCost < comparison[bi].milkRunCost ? i : bi, 0);
  setProcessedData(variantData[bestIdx]);
}
```
generalizes to pick the metric field by criterion instead of always `milkRunCost`.

## Notification

A banner at the top of `AlgorithmComparison.tsx` (shared by both the post-upload popup and the sidebar "Algorithm Comparison" tab, so the notification is consistent wherever the table appears), e.g.:

> 🏆 Best by Min Cost: **Nearest Neighbor (2-opt)** — ฿1,864

The banner reuses the column's already-computed best-index (`bestCost` / `bestCO2` / `bestDist`, all of which `AlgorithmComparison` already computes for column highlighting) rather than recomputing anything — it just picks which of the three existing indices to display based on a new `optimizationCriterion` prop passed down from `App.tsx`.

## Data Flow

- `App.tsx`: one new state, `optimizationCriterion: 'cost' | 'co2' | 'distance'`, default `'cost'`.
- New radio group UI in the Params modal, bound to that state.
- `handleCompareAll`'s auto-select reduce keys off `optimizationCriterion` (`milkRunCost` / `milkRunCO2` / `milkRunDistance`).
- `optimizationCriterion` passed as a new prop to `AlgorithmComparison` (used by both its call site in the popup and its call site in the tab-rendered path in `App.tsx`).
- `AlgorithmComparison` renders the banner using its existing `bestCost`/`bestCO2`/`bestDist` variables, selecting one based on the prop.

## Testing

Pure UI/state wiring, no new business logic in `geo.ts`/`algorithms.ts` — no new unit tests needed there. Verify manually in-browser: select each of the three criteria in turn, submit, confirm Dashboard's default view matches the criterion's actual minimum (cross-check against the comparison table), and confirm the banner names the correct algorithm/2-opt state and value for each criterion.
