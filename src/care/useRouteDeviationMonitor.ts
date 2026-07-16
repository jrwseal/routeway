import { useEffect, useRef, useState } from 'react';
import type { GeoReading } from './useGeolocation';
import {
  evaluateDeviation,
  INITIAL_DEVIATION_STATE,
  perpendicularDistanceMeters,
  type LatLon,
  type DeviationState,
} from '../lib/routeDeviation';
import { appendDeviationLog, type DeviationLogEntry } from './deviationLog';

/**
 * Takes `coords` from the caller's own useGeolocation() (Phase 2.5) rather than
 * calling the hook itself — one watchPosition stream, not two.
 */
export function useRouteDeviationMonitor(
  coords: GeoReading | null,
  polyline: LatLon[],
  corridorMeters = 300,
  minDurationMinutes = 3,
) {
  const stateRef = useRef<DeviationState>(INITIAL_DEVIATION_STATE);
  const [activeDeviation, setActiveDeviation] = useState<DeviationLogEntry | null>(null);
  const [distanceFromRoute, setDistanceFromRoute] = useState<number | null>(null);

  useEffect(() => {
    if (!coords || polyline.length === 0) return;
    const point: LatLon = { lat: coords.lat, lon: coords.lon };
    const distance = perpendicularDistanceMeters(point, polyline);
    setDistanceFromRoute(distance);

    const { state, event } = evaluateDeviation(
      stateRef.current,
      point,
      distance,
      corridorMeters,
      minDurationMinutes * 60000,
      Date.now(),
    );
    stateRef.current = state;

    if (event) {
      appendDeviationLog(event);
      setActiveDeviation(event);
    } else if (state.deviationStartedAt === null) {
      setActiveDeviation(null);
    }
  }, [coords, polyline, corridorMeters, minDurationMinutes]);

  const dismissActiveDeviation = () => setActiveDeviation(null);

  return { distanceFromRoute, activeDeviation, dismissActiveDeviation };
}
