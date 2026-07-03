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
  const maxCapacity = getMaxCapacity(params);

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
