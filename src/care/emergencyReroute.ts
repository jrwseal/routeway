import type { ProcessedData, RouteLeg, RouteNode } from '../types';
import { getFallbackDist } from '../lib/geo';

/**
 * Cheapest Insertion heuristic for an open path (no return leg): starting
 * from the vehicle's current position, repeatedly insert whichever
 * remaining stop adds the least extra distance at its cheapest slot in the
 * route built so far. O(n^2), fine for the handful of stops left on a
 * single route mid-run.
 */
export function cheapestInsertionOrder(
  startPos: { lat: number; lon: number },
  stops: RouteNode[],
): RouteNode[] {
  if (stops.length === 0) return [];

  const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
    getFallbackDist([a.lon, a.lat], [b.lon, b.lat]);

  const unvisited = [...stops];
  let seedIdx = 0;
  let seedDist = Infinity;
  unvisited.forEach((n, i) => {
    const d = dist(startPos, n);
    if (d < seedDist) { seedDist = d; seedIdx = i; }
  });
  const route: RouteNode[] = unvisited.splice(seedIdx, 1);

  while (unvisited.length > 0) {
    let bestCost = Infinity;
    let bestCandidateIdx = -1;
    let bestPos = -1;

    for (let ci = 0; ci < unvisited.length; ci++) {
      const candidate = unvisited[ci];
      for (let pos = 0; pos <= route.length; pos++) {
        const prev = pos === 0 ? startPos : route[pos - 1];
        const next = pos < route.length ? route[pos] : null;
        const cost = next
          ? dist(prev, candidate) + dist(candidate, next) - dist(prev, next)
          : dist(prev, candidate);
        if (cost < bestCost) {
          bestCost = cost;
          bestCandidateIdx = ci;
          bestPos = pos;
        }
      }
    }

    const [node] = unvisited.splice(bestCandidateIdx, 1);
    route.splice(bestPos, 0, node);
  }

  return route;
}

function buildOpenPathLegs(
  startPos: RouteNode,
  sequence: RouteNode[],
  routeIndex: number,
): RouteLeg[] {
  const legs: RouteLeg[] = [];
  let from = startPos;
  for (const to of sequence) {
    legs.push({
      fromNode: from,
      toNode: to,
      distanceKm: getFallbackDist([from.lon, from.lat], [to.lon, to.lat]),
      durationSec: 0,
      arrivalDate: null,
      waitingMinutes: 0,
      status: 'N/A',
      geometry: null,
      isReturnToDepot: false,
      routeIndex,
    });
    from = to;
  }
  return legs;
}

export interface EmergencyRerouteResult {
  routeIndex: number;
  brokenDownAt: RouteNode;
  originalRemainingLegs: RouteLeg[];
  newLegs: RouteLeg[];
  elapsedMs: number;
}

/**
 * Simulates a mid-route breakdown/blockage: everything already delivered on
 * the route stays as-is, and the remaining (not-yet-delivered) stops are
 * re-sequenced from the vehicle's last-known position via cheapest
 * insertion. Manual trigger only — no live traffic/GPS feed, per Phase 4
 * (stretch) scope.
 */
export function simulateEmergencyReroute(
  data: ProcessedData,
  routeIndex: number,
  brokenDownAtNode: RouteNode,
): EmergencyRerouteResult | null {
  const routeLegs = data.legs
    .filter(l => l.routeIndex === routeIndex && !l.isReturnToDepot)
    .sort((a, b) => a.routeIndex - b.routeIndex);

  const sequenceNodes = routeLegs.map(l => l.toNode);
  const breakIdx = sequenceNodes.findIndex(
    n => n.lat === brokenDownAtNode.lat && n.lon === brokenDownAtNode.lon && n.location === brokenDownAtNode.location,
  );
  if (breakIdx === -1) return null;

  const remaining = sequenceNodes.slice(breakIdx + 1);
  if (remaining.length === 0) return null;

  const originalRemainingLegs = buildOpenPathLegs(brokenDownAtNode, remaining, routeIndex);

  const t0 = performance.now();
  const newOrder = cheapestInsertionOrder(brokenDownAtNode, remaining);
  const elapsedMs = performance.now() - t0;

  const newLegs = buildOpenPathLegs(brokenDownAtNode, newOrder, routeIndex);

  return {
    routeIndex,
    brokenDownAt: brokenDownAtNode,
    originalRemainingLegs,
    newLegs,
    elapsedMs,
  };
}
