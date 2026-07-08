// src/lib/waitingAdvisor.ts
import { ProcessedData, Vehicle } from '../types';
import { parseVehicleTime } from './geo';

export interface VehicleWaitingAdvisory {
  routeIndex: number;
  vehicle: Vehicle;
  totalWaitingHours: number;
  suggestedDelayMinutes: number;
  suggestedDepartureTime: Date | null;
}

const WAITING_THRESHOLD_HOURS = 1;

export function getPerVehicleWaitingAdvisories(data: ProcessedData): VehicleWaitingAdvisory[] {
  const todayStr = data.departureTime.toISOString().split('T')[0];
  const advisories: VehicleWaitingAdvisory[] = [];

  for (const routeSummary of data.routeSummaries) {
    const routeLegs = data.legs.filter(leg => leg.routeIndex === routeSummary.routeIndex);

    const totalWaitingMinutes = routeLegs.reduce((sum, leg) => sum + leg.waitingMinutes, 0);
    const totalWaitingHours = totalWaitingMinutes / 60;
    if (totalWaitingHours <= WAITING_THRESHOLD_HOURS) {
      continue;
    }

    const positiveWaits = routeLegs.map(leg => leg.waitingMinutes).filter(w => w > 0);
    if (positiveWaits.length === 0) {
      continue;
    }
    const safeShiftMinutes = Math.min(...positiveWaits);

    const slacks: number[] = [];
    for (const leg of routeLegs) {
      if (leg.arrivalDate && leg.toNode.dueTime) {
        slacks.push((leg.toNode.dueTime.getTime() - leg.arrivalDate.getTime()) / 60000);
      }
    }
    const minSlack = slacks.length > 0 ? Math.min(...slacks) : Infinity;

    const cappedDelay = Math.max(0, Math.min(safeShiftMinutes, minSlack));
    const suggestedDelayMinutes = Math.floor(cappedDelay);

    const baseDeparture = parseVehicleTime(routeSummary.vehicle.departureTime, todayStr);

    advisories.push({
      routeIndex: routeSummary.routeIndex,
      vehicle: routeSummary.vehicle,
      totalWaitingHours,
      suggestedDelayMinutes,
      suggestedDepartureTime:
        suggestedDelayMinutes > 0
          ? new Date(baseDeparture.getTime() + suggestedDelayMinutes * 60000)
          : null,
    });
  }

  return advisories;
}
