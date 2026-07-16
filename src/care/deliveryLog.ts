import type { Coordinates } from '../lib/geofence';

export interface DeliveryLogEntry {
  parcelId: string;
  plannedTime: string | null;
  actualTime: string;
  actualCoordinates: Coordinates;
  distanceAtConfirm: number;
}

const STORAGE_KEY = 'routeway-care-delivery-log';

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function getDeliveryLog(): DeliveryLogEntry[] {
  if (!hasLocalStorage()) return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DeliveryLogEntry[];
  } catch {
    return [];
  }
}

export function appendDeliveryLog(entry: DeliveryLogEntry): DeliveryLogEntry[] {
  const next = [entry, ...getDeliveryLog()];
  if (hasLocalStorage()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}
