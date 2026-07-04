# Algorithm Comparison Popup — Design

**Goal:** After a CSV manifest is uploaded and routing parameters submitted, show the Algorithm Comparison table as a popup overlay on top of the Dashboard, instead of auto-switching to the Comparison tab. The Comparison tab keeps working as-is so the same table can be reopened later.

## Trigger & Flow

`App.tsx`'s `handleCompareAll` already computes all 7 algorithm variants into `comparisonData` — unchanged. Currently it ends with `setCurrentTab('comparison')`. That line becomes `setCurrentTab('dashboard')` instead, and a new `isComparisonModalOpen` boolean state is set to `true`. Dashboard renders underneath (using the already-auto-selected lowest-cost variant), the popup sits on top of it.

Setting `currentTab` to `'dashboard')` explicitly (not just leaving it alone) matters: if the user had the Comparison tab open when they upload a new CSV, `currentTab` would already be `'comparison'`, and dismissing the popup would just reveal the same tab instead of Dashboard.

## Component

New `src/components/ComparisonPopup.tsx` — a thin wrapper, no algorithm logic:
- Fixed-inset backdrop, same visual style as the existing Params modal (`bg-slate-900/50 backdrop-blur-sm`, `animate-fade-in`).
- Centered panel, **`max-w-5xl`** (the comparison table is 8 columns — the existing Params modal's `max-w-md` is far too narrow for this). Panel has a max-height with vertical scroll so the header + all 7 rows fit; the table's own `overflow-x-auto` handles horizontal scroll if needed.
- Renders the existing `<AlgorithmComparison>` component unchanged inside the panel — no changes to `AlgorithmComparison.tsx` itself.
- Close (X) button in the panel's top-right corner.

## Dismiss

Three ways to close, all just call `setIsComparisonModalOpen(false)`:
1. X button click
2. Backdrop click
3. Escape key — a `keydown` listener registered only while the popup is open (removed on close/unmount)

All three land on Dashboard (already the active tab) showing the auto-selected lowest-cost variant (already computed).

## View button

Same `onSelectVariant` callback `App.tsx` already passes to `AlgorithmComparison` (switches `processedData` to the picked variant, sets tab to `'dashboard'`) — one line added to also call `setIsComparisonModalOpen(false)`.

## Testing

Pure UI wiring reusing already-tested, already-reviewed components (`AlgorithmComparison`, the algorithm pipeline). No new unit-test surface. Verify manually in-browser:
- Upload CSV → submit params → popup auto-appears, sized correctly (all 7 rows visible/scrollable, not cramped like the narrow Params modal)
- Click View on a row → popup closes, Dashboard shows that variant
- Reopen via the "Algorithm Comparison" nav tab → same table still renders inline, unaffected by the popup change
- X button, backdrop click, and Escape key each independently dismiss the popup back to Dashboard
- No console errors across the above
