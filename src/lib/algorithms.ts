import { getFallbackDist } from './geo';
import type { RouteNode, ProcessingParams } from '../types';

function getMaxCapacity(params: ProcessingParams): number {
  return params.fleetPool.length > 0
    ? Math.max(...params.fleetPool.map(v => v.capacityCBM))
    : Infinity;
}

function nodeVol(node: RouteNode): number {
  return isNaN(node.demandVolume) ? 0 : node.demandVolume;
}

export function checkRouteFeasible(routeSeq: number[], nodes: RouteNode[], params: ProcessingParams): boolean {
  const depot = nodes[0];
  const maxCapacity = getMaxCapacity(params);

  let routeVolume = 0;
  for (const idx of routeSeq) routeVolume += nodeVol(nodes[idx]);
  if (routeVolume > maxCapacity) return false;

  let currentTime = params.startTime;
  let currentLoc = depot;
  for (const idx of routeSeq) {
    const node = nodes[idx];
    const dist = getFallbackDist([currentLoc.lon, currentLoc.lat], [node.lon, node.lat]);
    const durationSec = (dist / params.avgSpeed) * 3600;
    const arrivalTime = new Date(currentTime.getTime() + durationSec * 1000);
    let departureTime = arrivalTime;
    if (node.readyTime && arrivalTime < node.readyTime) departureTime = node.readyTime;
    if (node.dueTime && arrivalTime > node.dueTime) return false;
    currentTime = new Date(departureTime.getTime() + 30 * 60 * 1000);
    currentLoc = node;
  }
  return true;
}

export function clarkWrightSavings(nodes: RouteNode[], params: ProcessingParams): number[][] {
  const depot = nodes[0];

  const savings: { i: number; j: number; savings: number }[] = [];
  for (let i = 1; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dI = getFallbackDist([depot.lon, depot.lat], [nodes[i].lon, nodes[i].lat]);
      const dJ = getFallbackDist([depot.lon, depot.lat], [nodes[j].lon, nodes[j].lat]);
      const dIJ = getFallbackDist([nodes[i].lon, nodes[i].lat], [nodes[j].lon, nodes[j].lat]);
      const s = dI + dJ - dIJ;
      if (s > 0) savings.push({ i, j, savings: s });
    }
  }
  savings.sort((a, b) => b.savings - a.savings);

  let routes: number[][] = [];
  for (let i = 1; i < nodes.length; i++) routes.push([i]);

  for (const s of savings) {
    const { i, j } = s;
    let routeIIdx = -1, routeJIdx = -1;
    for (let r = 0; r < routes.length; r++) {
      if (routes[r].includes(i)) routeIIdx = r;
      if (routes[r].includes(j)) routeJIdx = r;
    }
    if (routeIIdx === -1 || routeJIdx === -1 || routeIIdx === routeJIdx) continue;

    const routeI = routes[routeIIdx];
    const routeJ = routes[routeJIdx];
    const iIsFirst = routeI[0] === i, iIsLast = routeI[routeI.length - 1] === i;
    const jIsFirst = routeJ[0] === j, jIsLast = routeJ[routeJ.length - 1] === j;

    if ((iIsFirst || iIsLast) && (jIsFirst || jIsLast)) {
      let ri = [...routeI], rj = [...routeJ];
      if (iIsFirst) ri.reverse();
      if (jIsLast) rj.reverse();
      const proposed = [...ri, ...rj];
      if (checkRouteFeasible(proposed, nodes, params)) {
        routes = routes.filter((_, idx) => idx !== routeIIdx && idx !== routeJIdx);
        routes.push(proposed);
      }
    }
  }
  return routes;
}

export function nearestNeighbor(nodes: RouteNode[], params: ProcessingParams): number[][] {
  const maxCapacity = getMaxCapacity(params);
  const unvisited = new Set<number>();
  for (let i = 1; i < nodes.length; i++) unvisited.add(i);

  const routes: number[][] = [];

  while (unvisited.size > 0) {
    const route: number[] = [];
    let routeVolume = 0;
    let currentIdx = 0;

    while (true) {
      let bestIdx = -1;
      let bestDist = Infinity;

      for (const idx of unvisited) {
        const vol = nodeVol(nodes[idx]);
        if (routeVolume + vol > maxCapacity) continue;
        const dist = getFallbackDist(
          [nodes[currentIdx].lon, nodes[currentIdx].lat],
          [nodes[idx].lon, nodes[idx].lat]
        );
        if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
      }

      if (bestIdx === -1) break;
      routeVolume += nodeVol(nodes[bestIdx]);
      route.push(bestIdx);
      unvisited.delete(bestIdx);
      currentIdx = bestIdx;
    }

    if (route.length > 0) routes.push(route);
    else {
      // Remaining nodes can't fit any vehicle — assign each individually
      for (const idx of unvisited) routes.push([idx]);
      break;
    }
  }

  return routes;
}

export function sweep(nodes: RouteNode[], params: ProcessingParams): number[][] {
  const maxCapacity = getMaxCapacity(params);
  const depot = nodes[0];

  const customers: { idx: number; angle: number }[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const angle = Math.atan2(nodes[i].lat - depot.lat, nodes[i].lon - depot.lon);
    customers.push({ idx: i, angle });
  }
  customers.sort((a, b) => a.angle - b.angle);

  const routes: number[][] = [];
  let route: number[] = [];
  let routeVolume = 0;

  for (const { idx } of customers) {
    const vol = nodeVol(nodes[idx]);
    if (routeVolume + vol > maxCapacity && route.length > 0) {
      routes.push(route);
      route = [];
      routeVolume = 0;
    }
    route.push(idx);
    routeVolume += vol;
  }
  if (route.length > 0) routes.push(route);
  return routes;
}

export function twoOpt(route: number[], nodes: RouteNode[]): number[] {
  if (route.length < 4) return route;

  let best = [...route];
  let improved = true;

  while (improved) {
    improved = false;
    outer: for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 2; j < best.length; j++) {
        const ni = nodes[best[i]], ni1 = nodes[best[i + 1]];
        const nj = nodes[best[j]];
        const nj1 = j + 1 < best.length ? nodes[best[j + 1]] : nodes[0];

        const ci: [number, number] = [ni.lon, ni.lat];
        const ci1: [number, number] = [ni1.lon, ni1.lat];
        const cj: [number, number] = [nj.lon, nj.lat];
        const cj1: [number, number] = [nj1.lon, nj1.lat];

        const current = getFallbackDist(ci, ci1) + getFallbackDist(cj, cj1);
        const swapped = getFallbackDist(ci, cj) + getFallbackDist(ci1, cj1);

        if (swapped < current - 0.001) {
          best = [
            ...best.slice(0, i + 1),
            ...best.slice(i + 1, j + 1).reverse(),
            ...best.slice(j + 1),
          ];
          improved = true;
          break outer;
        }
      }
    }
  }

  return best;
}

function routeDistance(routeSeq: number[], nodes: RouteNode[]): number {
  const depot = nodes[0];
  const full = [0, ...routeSeq, 0];
  let d = 0;
  for (let i = 0; i < full.length - 1; i++) {
    const a = full[i] === 0 ? depot : nodes[full[i]];
    const b = full[i + 1] === 0 ? depot : nodes[full[i + 1]];
    d += getFallbackDist([a.lon, a.lat], [b.lon, b.lat]);
  }
  return d;
}

function totalDistance(routes: number[][], nodes: RouteNode[]): number {
  return routes.reduce((sum, r) => sum + routeDistance(r, nodes), 0);
}

export function twoOptFeasible(route: number[], nodes: RouteNode[], params: ProcessingParams): number[] {
  const optimized = twoOpt(route, nodes);
  return checkRouteFeasible(optimized, nodes, params) ? optimized : route;
}

export function orOptAnnealing(nodes: RouteNode[], params: ProcessingParams): number[][] {
  const ITERATIONS = 500;
  let routes: number[][] = clarkWrightSavings(nodes, params).map(r => [...r]);
  let bestRoutes: number[][] = routes.map(r => [...r]);
  let bestCost = totalDistance(bestRoutes, nodes);
  let currentCost = bestCost;

  const initialT = currentCost > 0 ? currentCost / Math.max(nodes.length - 1, 1) : 1;
  let temperature = initialT;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    temperature *= 0.99;

    const sourceCandidates = routes
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => r.length > 0);
    if (sourceCandidates.length === 0) break;

    const { idx: sourceIdx } = sourceCandidates[Math.floor(Math.random() * sourceCandidates.length)];
    const sourceRoute = routes[sourceIdx];

    const segLen = Math.min(1 + Math.floor(Math.random() * 3), sourceRoute.length);
    const segStart = Math.floor(Math.random() * (sourceRoute.length - segLen + 1));
    const segment = sourceRoute.slice(segStart, segStart + segLen);

    const targetIdx = Math.floor(Math.random() * routes.length);

    const newSourceRoute = [...sourceRoute.slice(0, segStart), ...sourceRoute.slice(segStart + segLen)];

    const targetBaseRoute = targetIdx === sourceIdx ? newSourceRoute : routes[targetIdx];
    const insertPos = Math.floor(Math.random() * (targetBaseRoute.length + 1));
    const newTargetRoute = [
      ...targetBaseRoute.slice(0, insertPos),
      ...segment,
      ...targetBaseRoute.slice(insertPos),
    ];

    const candidateRoutes = routes.map((r, i) => {
      if (i === sourceIdx && i === targetIdx) return newTargetRoute;
      if (i === sourceIdx) return newSourceRoute;
      if (i === targetIdx) return newTargetRoute;
      return r;
    }).filter(r => r.length > 0);

    if (newSourceRoute.length > 0 && !checkRouteFeasible(newSourceRoute, nodes, params)) continue;
    if (!checkRouteFeasible(newTargetRoute, nodes, params)) continue;

    const candidateCost = totalDistance(candidateRoutes, nodes);
    const delta = candidateCost - currentCost;

    const accept = delta < 0 || Math.random() < Math.exp(-delta / Math.max(temperature, 0.0001));
    if (accept) {
      routes = candidateRoutes;
      currentCost = candidateCost;
      if (candidateCost < bestCost) {
        bestCost = candidateCost;
        bestRoutes = candidateRoutes.map(r => [...r]);
      }
    }
  }

  return bestRoutes.map(r => twoOptFeasible(r, nodes, params));
}

export function solomonI1(nodes: RouteNode[], params: ProcessingParams): number[][] {
  const depot = nodes[0];
  const unrouted = new Set<number>();
  for (let i = 1; i < nodes.length; i++) unrouted.add(i);

  const routes: number[][] = [];

  const distToDepot = (idx: number) =>
    getFallbackDist([depot.lon, depot.lat], [nodes[idx].lon, nodes[idx].lat]);

  const distBetween = (a: number, b: number) => {
    const na = a === 0 ? depot : nodes[a];
    const nb = b === 0 ? depot : nodes[b];
    return getFallbackDist([na.lon, na.lat], [nb.lon, nb.lat]);
  };

  function seedNewRoute(): boolean {
    if (unrouted.size === 0) return false;
    // Find the unrouted customer farthest from the depot; tie-break by lowest index
    const candidates: { idx: number; d: number }[] = [];
    for (let idx = 1; idx < nodes.length; idx++) {
      if (!unrouted.has(idx)) continue;
      candidates.push({ idx, d: distToDepot(idx) });
    }
    if (candidates.length === 0) return false;
    // Sort by distance descending, then by index ascending (for tie-breaking)
    candidates.sort((a, b) => b.d - a.d || a.idx - b.idx);
    const seed = candidates[0].idx;
    routes.push([seed]);
    unrouted.delete(seed);
    return true;
  }

  function bestInsertion(route: number[], u: number): { pos: number; cost: number } | null {
    let bestPos = -1;
    let bestCost = Infinity;
    for (let pos = 0; pos <= route.length; pos++) {
      const i = pos === 0 ? 0 : route[pos - 1];
      const j = pos === route.length ? 0 : route[pos];
      const c1 = distBetween(i, u) + distBetween(u, j) - distBetween(i, j);
      const candidate = [...route.slice(0, pos), u, ...route.slice(pos)];
      if (checkRouteFeasible(candidate, nodes, params) && c1 < bestCost) {
        bestCost = c1;
        bestPos = pos;
      }
    }
    return bestPos === -1 ? null : { pos: bestPos, cost: bestCost };
  }

  seedNewRoute();

  while (unrouted.size > 0) {
    let chosenCustomer = -1;
    let chosenRouteIdx = -1;
    let chosenPos = -1;
    let bestRegret = -Infinity;

    for (const u of unrouted) {
      let bestForU: { routeIdx: number; pos: number; cost: number } | null = null;
      for (let r = 0; r < routes.length; r++) {
        const insertion = bestInsertion(routes[r], u);
        if (insertion && (!bestForU || insertion.cost < bestForU.cost)) {
          bestForU = { routeIdx: r, pos: insertion.pos, cost: insertion.cost };
        }
      }
      if (bestForU) {
        const regret = distToDepot(u) - bestForU.cost;
        if (regret > bestRegret) {
          bestRegret = regret;
          chosenCustomer = u;
          chosenRouteIdx = bestForU.routeIdx;
          chosenPos = bestForU.pos;
        }
      }
    }

    if (chosenCustomer === -1) {
      if (!seedNewRoute()) break;
      continue;
    }

    const route = routes[chosenRouteIdx];
    routes[chosenRouteIdx] = [...route.slice(0, chosenPos), chosenCustomer, ...route.slice(chosenPos)];
    unrouted.delete(chosenCustomer);
  }

  return routes;
}
