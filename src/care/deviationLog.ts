import type { DeviationEvent } from '../lib/routeDeviation';

export type DeviationReason = 'traffic' | 'road-closed' | 'other-stop';

export interface DeviationLogEntry extends DeviationEvent {
  reason?: DeviationReason;
}

const STORAGE_KEY = 'routeway-care-deviation-log';

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function getDeviationLog(): DeviationLogEntry[] {
  if (!hasLocalStorage()) return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DeviationLogEntry[];
  } catch {
    return [];
  }
}

export function appendDeviationLog(event: DeviationEvent): DeviationLogEntry[] {
  const next = [{ ...event }, ...getDeviationLog()];
  if (hasLocalStorage()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

/** Tags the most recent entry with a driver-supplied reason (a no-op if the log is empty). */
export function setReasonForLatest(reason: DeviationReason): DeviationLogEntry[] {
  const log = getDeviationLog();
  if (log.length === 0) return log;
  const next = [{ ...log[0], reason }, ...log.slice(1)];
  if (hasLocalStorage()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}
