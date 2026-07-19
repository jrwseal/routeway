import { getFallbackDist } from './geo';
import { nodeKey } from './nodeKey';
import type { RouteNode, ProcessingParams } from '../types';

const PENALTY_PER_MINUTE = 10;
export const TIER_WEIGHT: Record<string, number> = { critical: 3, standard: 1.5, low: 1 };

export function computeExposurePenalty(
  routes: number[][],
  nodes: RouteNode[],
  params: ProcessingParams,
): number {
  const depot = nodes[0];
  let penalty = 0;

  for (const route of routes) {
    let currentTime = params.startTime;
    let currentLoc = depot;

    for (const idx of route) {
      const node = nodes[idx];
      const dist = getFallbackDist([currentLoc.lon, currentLoc.lat], [node.lon, node.lat]);
      const durationSec = (dist / params.avgSpeed) * 3600;
      // Self-calibration (Care Phase 3.5): distance/avgSpeed is a static guess.
      // If driver check-ins (Phase 2.5) show this stop consistently runs late
      // or early, calibratedDelayByNodeKey carries a moving average of that
      // real-world deviation and nudges the *input* travel-time estimate for
      // this one stop — the search itself (or-opt/SA) is untouched.
      const calibratedDelayMs = (params.calibratedDelayByNodeKey?.get(nodeKey(node)) ?? 0) * 60000;
      const arrivalTime = new Date(currentTime.getTime() + durationSec * 1000 + calibratedDelayMs);
      const departureTime = node.readyTime && arrivalTime < node.readyTime ? node.readyTime : arrivalTime;
      const elapsedMinutes = (arrivalTime.getTime() - params.startTime.getTime()) / 60000;

      for (const parcel of node.parcels ?? []) {
        if (elapsedMinutes > parcel.maxExposureMinutes) {
          const overageMinutes = elapsedMinutes - parcel.maxExposureMinutes;
          const tierWeight = TIER_WEIGHT[parcel.tier] ?? 1;
          penalty += overageMinutes * PENALTY_PER_MINUTE * tierWeight;
        }
      }

      currentTime = new Date(departureTime.getTime() + 30 * 60 * 1000);
      currentLoc = node;
    }
  }

  return penalty;
}
