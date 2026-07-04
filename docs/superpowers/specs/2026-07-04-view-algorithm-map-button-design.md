# "View Algorithm" Button on Map — Design

**Goal:** Let the user reopen the Algorithm Comparison popup directly from the Dashboard, without going through the Sidebar's "Algorithm Comparison" nav tab.

## Placement

A floating button on the bottom-left corner of `RouteMap` — the one empty corner of the map (top-left has Leaflet's default zoom control, top-right has the existing Route Filter panel, bottom-right has the Leaflet/OSM attribution). Same visual style as the Route Filter panel: white background, rounded corners, shadow, `z-[1000]` (matches the filter panel's z-index so both sit consistently above map tiles/markers).

## Wiring

- `RouteMap.tsx` gets a new optional prop `onViewAlgorithm?: () => void`. The button only renders when this prop is passed (keeps `RouteMap` usable in contexts that don't have comparison data, if any exist later).
- `Dashboard.tsx` gets a new optional prop `onViewAlgorithm?: () => void`, passed straight through to `RouteMap`.
- `App.tsx` passes `() => setIsComparisonModalOpen(true)` to `Dashboard`, only when `comparisonData` is non-null (same guard the existing popup render already uses) — so the button is only present when there's actually a comparison to show.

No new state, no changes to `ComparisonPopup.tsx` or `AlgorithmComparison.tsx` — this only adds a second trigger for the popup that already exists, alongside the sidebar nav tab and the automatic post-upload popup.

## Testing

Pure UI wiring, no new logic. Verify manually in-browser: after uploading a CSV, the button appears bottom-left on the map; clicking it opens the same Algorithm Comparison popup as the sidebar tab and the auto-popup; no visual overlap with the zoom control, Route Filter panel, or attribution.
