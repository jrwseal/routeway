// src/lib/waitingAdvisor.ts
import { ProcessedData } from '../types';

export interface WaitingAdvisory {
  totalWaitingHours: number;
  suggestedDelayMinutes: number;
  suggestedDepartureTime: Date | null;
}

const WAITING_THRESHOLD_HOURS = 1;

export function getWaitingAdvisory(data: ProcessedData): WaitingAdvisory | null {
  if (data.totalWaitingHours <= WAITING_THRESHOLD_HOURS) {
    return null;
  }

  const positiveWaits = data.legs.map(leg => leg.waitingMinutes).filter(w => w > 0);
  if (positiveWaits.length === 0) {
    return null;
  }
  const safeShiftMinutes = Math.min(...positiveWaits);

  const slacks: number[] = [];
  for (const leg of data.legs) {
    if (leg.arrivalDate && leg.toNode.dueTime) {
      slacks.push((leg.toNode.dueTime.getTime() - leg.arrivalDate.getTime()) / 60000);
    }
  }
  const minSlack = slacks.length > 0 ? Math.min(...slacks) : Infinity;

  const cappedDelay = Math.max(0, Math.min(safeShiftMinutes, minSlack));
  const suggestedDelayMinutes = Math.round(cappedDelay);

  return {
    totalWaitingHours: data.totalWaitingHours,
    suggestedDelayMinutes,
    suggestedDepartureTime:
      suggestedDelayMinutes > 0
        ? new Date(data.departureTime.getTime() + suggestedDelayMinutes * 60000)
        : null,
  };
}
