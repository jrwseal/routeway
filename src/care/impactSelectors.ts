import type { ProcessedData, Parcel } from '../types';
import type { DeliveryLogEntry } from './deliveryLog';
import { getParcelExposureRows } from './selectors';

export interface DeliveryOutcome {
  parcelId: string;
  parcelName: string;
  tier: Parcel['tier'];
  maxExposureMinutes: number;
  actualElapsedMinutes: number;
  onTime: boolean;
  date: string;
}

/**
 * Actual elapsed exposure = planned elapsed (from the optimized route) plus the
 * real-world delay observed at check-in (actualTime - plannedTime). This avoids
 * re-deriving an absolute depot-departure clock from a log entry that only
 * carries a single timestamp.
 */
export function joinDeliveryOutcomes(data: ProcessedData, log: DeliveryLogEntry[]): DeliveryOutcome[] {
  const plannedByParcelId = new Map(getParcelExposureRows(data).map(r => [r.parcel.id, r]));

  const outcomes: DeliveryOutcome[] = [];
  for (const entry of log) {
    const planned = plannedByParcelId.get(entry.parcelId);
    if (!planned) continue;
    const delayMinutes = entry.plannedTime
      ? (new Date(entry.actualTime).getTime() - new Date(entry.plannedTime).getTime()) / 60000
      : 0;
    const actualElapsedMinutes = planned.elapsedMinutes + delayMinutes;
    outcomes.push({
      parcelId: entry.parcelId,
      parcelName: planned.parcel.name,
      tier: planned.parcel.tier,
      maxExposureMinutes: planned.parcel.maxExposureMinutes,
      actualElapsedMinutes,
      onTime: actualElapsedMinutes <= planned.parcel.maxExposureMinutes,
      date: entry.actualTime.slice(0, 10),
    });
  }
  return outcomes;
}

export function getActualOnTimePercent(outcomes: DeliveryOutcome[]): number {
  if (outcomes.length === 0) return 100;
  return (outcomes.filter(o => o.onTime).length / outcomes.length) * 100;
}

export interface DailyTrendPoint {
  date: string;
  onTimePercent: number;
  count: number;
}

export function getDailyOnTimeTrend(outcomes: DeliveryOutcome[]): DailyTrendPoint[] {
  const byDate = new Map<string, DeliveryOutcome[]>();
  for (const o of outcomes) {
    const list = byDate.get(o.date) ?? [];
    list.push(o);
    byDate.set(o.date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, onTimePercent: getActualOnTimePercent(items), count: items.length }));
}

/** % fewer at-risk (expired) parcels vs a baseline route optimized without cold-chain awareness. */
export function getWasteReductionPercent(optimized: ProcessedData, baseline: ProcessedData): number {
  const optimizedExpired = getParcelExposureRows(optimized).filter(r => r.status === 'expired').length;
  const baselineExpired = getParcelExposureRows(baseline).filter(r => r.status === 'expired').length;
  if (baselineExpired === 0) return 0;
  return ((baselineExpired - optimizedExpired) / baselineExpired) * 100;
}
