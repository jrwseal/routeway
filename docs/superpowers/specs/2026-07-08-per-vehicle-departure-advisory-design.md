# Per-Vehicle Departure Time Advisory

## Problem

`getWaitingAdvisory()` (src/lib/waitingAdvisor.ts) computes one plan-wide suggested departure delay, using the single top-level `ProcessedData.departureTime` as the baseline for every route. Since each vehicle now has its own configurable `departureTime` (fleet config), this is wrong for any plan with more than one vehicle: waiting minutes and due-time slack from *different* vehicles' legs get mixed together, and the suggested new time is added to a departure time no specific vehicle actually uses.

## Goal

Compute and display the suggested departure time separately for each vehicle/route, so the recommendation is "vehicle X should leave at HH:mm" instead of one blended number for the whole plan.

## Design

### `src/lib/waitingAdvisor.ts`

Replace `getWaitingAdvisory()` with:

```ts
export interface VehicleWaitingAdvisory {
  routeIndex: number;
  vehicle: Vehicle;
  totalWaitingHours: number;
  suggestedDelayMinutes: number;
  suggestedDepartureTime: Date | null;
}

export function getPerVehicleWaitingAdvisories(data: ProcessedData): VehicleWaitingAdvisory[]
```

For each entry in `data.routeSummaries`:
1. Filter `data.legs` to `leg.routeIndex === routeSummary.routeIndex`.
2. `totalWaitingHours` = sum of that route's `leg.waitingMinutes` / 60. Skip this route (omit from result) if `totalWaitingHours <= WAITING_THRESHOLD_HOURS` (unchanged constant, 1 hour).
3. `positiveWaits` = that route's legs with `waitingMinutes > 0`. Skip if empty (no safe shift possible).
4. `safeShiftMinutes` = min(positiveWaits).
5. `slacks` = for legs with `arrivalDate` and `toNode.dueTime`: `(dueTime - arrivalDate) / 60000`. `minSlack` = min(slacks) or `Infinity` if none.
6. `suggestedDelayMinutes` = `floor(max(0, min(safeShiftMinutes, minSlack)))` — same capping/flooring logic as today, just scoped to this route's legs.
7. Baseline departure = `routeSummary.vehicle.departureTime` (`"HH:mm"` string) combined with the calendar date of `data.departureTime` (same helper pattern as `parseVehicleTimeToday` in geo.ts, reimplemented locally since it's not exported).
8. `suggestedDepartureTime` = baseline + `suggestedDelayMinutes` if `suggestedDelayMinutes > 0`, else `null`.

Return the array of advisories for routes that pass step 2 (i.e. only vehicles actually worth flagging).

The old `getWaitingAdvisory()` and its plan-wide semantics are removed, not kept alongside.

### `src/components/WaitingTimeBanner.tsx`

Same file, same props (`data: ProcessedData`). Calls `getPerVehicleWaitingAdvisories(data)`; if empty, renders `null` (same as today). Otherwise renders one amber row per advisory, each showing the vehicle's name/color and either:
- "แนะนำเลื่อนเวลาออกเดินทางเป็น HH:mm เพื่อลดเวลารอ" (when a shift is possible), or
- the existing "ตารางเวลาปัจจุบันแน่นเกินไป" message (when `suggestedDelayMinutes` caps at 0).

Read-only — no button to apply the suggestion to fleet config. `Dashboard.tsx` needs no changes beyond what's already there (`<WaitingTimeBanner data={data} />` stays as-is since props are unchanged).

### Testing

Rewrite `src/lib/waitingAdvisor.test.ts` for the new function: multi-vehicle fixtures (2+ routeSummaries, legs split across `routeIndex`) proving:
- a wait on vehicle A's route doesn't affect vehicle B's computed delay or vice versa,
- a vehicle under the 1-hour threshold is omitted from the result while another over it is included,
- existing slack-capping and floor-not-round behavior (ported from the current five test cases) still holds per vehicle.

## Out of scope

- No "apply this time" button / no write-back to fleet config.
- No change to the per-vehicle-departureTime scheduling logic in `geo.ts` itself — this only changes the *advisory* calculation that reads the already-computed legs.
