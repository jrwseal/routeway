import type { ProcessedData, Parcel, RouteNode } from '../types';

export type ExposureStatus = 'safe' | 'warning' | 'expired';

export interface ParcelExposureRow {
  parcel: Parcel;
  node: RouteNode;
  routeIndex: number;
  elapsedMinutes: number;
  status: ExposureStatus;
}

function statusFor(elapsedMinutes: number, maxExposureMinutes: number): ExposureStatus {
  const ratio = elapsedMinutes / maxExposureMinutes;
  if (ratio >= 1) return 'expired';
  if (ratio >= 0.7) return 'warning';
  return 'safe';
}

export function getParcelExposureRows(data: ProcessedData): ParcelExposureRow[] {
  const rows: ParcelExposureRow[] = [];

  for (const { routeIndex } of data.routeSummaries) {
    const routeLegs = data.legs
      .filter(l => l.routeIndex === routeIndex && !l.isReturnToDepot && l.arrivalDate)
      .sort((a, b) => a.arrivalDate!.getTime() - b.arrivalDate!.getTime());

    if (routeLegs.length === 0) continue;
    const firstLeg = routeLegs[0];
    const depotDeparture = new Date(firstLeg.arrivalDate!.getTime() - firstLeg.durationSec * 1000);

    for (const leg of routeLegs) {
      const node = leg.toNode;
      if (!node.parcels || node.parcels.length === 0) continue;
      const elapsedMinutes = (leg.arrivalDate!.getTime() - depotDeparture.getTime()) / 60000;

      for (const parcel of node.parcels) {
        rows.push({
          parcel,
          node,
          routeIndex,
          elapsedMinutes,
          status: statusFor(elapsedMinutes, parcel.maxExposureMinutes),
        });
      }
    }
  }

  return rows;
}

export function getExposureSummary(rows: ParcelExposureRow[]): { onTimePercent: number; atRiskCount: number } {
  if (rows.length === 0) return { onTimePercent: 100, atRiskCount: 0 };
  const onTime = rows.filter(r => r.status !== 'expired').length;
  const atRiskCount = rows.filter(r => r.status !== 'safe').length;
  return { onTimePercent: (onTime / rows.length) * 100, atRiskCount };
}
