import type { RouteLeg } from '../types';

export interface LatLon {
  lat: number;
  lon: number;
}

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

const EARTH_RADIUS_M = 6371000;

/** Flattens an ordered route's legs into a polyline, preferring routed geometry over straight hops. */
export function legsToPolyline(legs: RouteLeg[]): LatLon[] {
  const points: LatLon[] = [];
  for (const leg of legs) {
    if (leg.geometry?.coordinates?.length) {
      for (const [lon, lat] of leg.geometry.coordinates as [number, number][]) {
        points.push({ lat, lon });
      }
    } else {
      points.push({ lat: leg.fromNode.lat, lon: leg.fromNode.lon });
      points.push({ lat: leg.toNode.lat, lon: leg.toNode.lon });
    }
  }
  return points;
}

/**
 * Shortest distance in meters from `point` to the nearest segment of `polyline`.
 * Projects both ends of each segment into a local meter-plane centered on `point`
 * (equirectangular approximation) — accurate to well under 1% error at the
 * few-hundred-meter corridor scale this is used for.
 */
export function perpendicularDistanceMeters(point: LatLon, polyline: LatLon[]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversineDistanceMeters(point, polyline[0]);

  const refLatRad = deg2rad(point.lat);
  const cosRefLat = Math.cos(refLatRad);
  const toXY = (p: LatLon) => ({
    x: deg2rad(p.lon - point.lon) * cosRefLat * EARTH_RADIUS_M,
    y: deg2rad(p.lat - point.lat) * EARTH_RADIUS_M,
  });

  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = toXY(polyline[i]);
    const b = toXY(polyline[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq === 0 ? 0 : ((0 - a.x) * dx + (0 - a.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const dist = Math.sqrt(px * px + py * py);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

function haversineDistanceMeters(a: LatLon, b: LatLon): number {
  const dLat = deg2rad(b.lat - a.lat);
  const dLon = deg2rad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(a.lat)) * Math.cos(deg2rad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_M * (2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

export interface DeviationState {
  deviationStartedAt: number | null;
  flaggedEpisodeStartedAt: number | null;
}

export interface DeviationEvent {
  timestamp: string;
  deviatedLocation: LatLon;
  distanceFromRoute: number;
  durationMinutes: number;
}

export const INITIAL_DEVIATION_STATE: DeviationState = {
  deviationStartedAt: null,
  flaggedEpisodeStartedAt: null,
};

/**
 * Flags a deviation only once the driver has been continuously outside the
 * corridor for at least `minDurationMs` — a single reading back inside the
 * corridor resets the clock, which absorbs GPS jitter false-alarms.
 */
export function evaluateDeviation(
  prev: DeviationState,
  point: LatLon,
  distanceMeters: number,
  corridorMeters: number,
  minDurationMs: number,
  now: number,
): { state: DeviationState; event: DeviationEvent | null } {
  if (distanceMeters <= corridorMeters) {
    return { state: INITIAL_DEVIATION_STATE, event: null };
  }

  const deviationStartedAt = prev.deviationStartedAt ?? now;
  const durationMs = now - deviationStartedAt;

  if (durationMs >= minDurationMs && prev.flaggedEpisodeStartedAt !== deviationStartedAt) {
    return {
      state: { deviationStartedAt, flaggedEpisodeStartedAt: deviationStartedAt },
      event: {
        timestamp: new Date(now).toISOString(),
        deviatedLocation: point,
        distanceFromRoute: Math.round(distanceMeters),
        durationMinutes: durationMs / 60000,
      },
    };
  }

  return { state: { deviationStartedAt, flaggedEpisodeStartedAt: prev.flaggedEpisodeStartedAt }, event: null };
}
