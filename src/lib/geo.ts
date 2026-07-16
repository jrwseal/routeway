import {
  RouteNode,
  RouteLeg,
  ProcessingParams,
  ProcessedData,
  Vehicle,
  RouteSummary,
} from "../types";
import { addSeconds, isAfter, isBefore } from "date-fns";
import { clarkWrightSavings, nearestNeighbor, sweep, twoOptFeasible, orOptAnnealing, solomonI1 } from './algorithms';

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

export const DEFAULT_FLEET_POOL: Vehicle[] = [
  {
    id: "4w-1",
    type: "4-wheel",
    name: "รถบรรทุก 4 ล้อใหญ่ - คันที่ 1",
    capacityCBM: 12,
    fuelConsumption: 0.12,
    fixedCost: 300,
    color: "#10B981",
    fuelPrice: 35,
    departureTime: "08:00",
  },
  {
    id: "4w-2",
    type: "4-wheel",
    name: "รถบรรทุก 4 ล้อใหญ่ - คันที่ 2",
    capacityCBM: 12,
    fuelConsumption: 0.12,
    fixedCost: 300,
    color: "#10B981",
    fuelPrice: 35,
    departureTime: "08:00",
  },
  {
    id: "4w-3",
    type: "4-wheel",
    name: "รถบรรทุก 4 ล้อใหญ่ - คันที่ 3",
    capacityCBM: 12,
    fuelConsumption: 0.12,
    fixedCost: 300,
    color: "#10B981",
    fuelPrice: 35,
    departureTime: "08:00",
  },
  {
    id: "6w-1",
    type: "6-wheel",
    name: "รถบรรทุก 6 ล้อ - คันที่ 1",
    capacityCBM: 32,
    fuelConsumption: 0.2,
    fixedCost: 450,
    color: "#3B82F6",
    fuelPrice: 35,
    departureTime: "08:00",
  },
  {
    id: "6w-2",
    type: "6-wheel",
    name: "รถบรรทุก 6 ล้อ - คันที่ 2",
    capacityCBM: 32,
    fuelConsumption: 0.2,
    fixedCost: 450,
    color: "#3B82F6",
    fuelPrice: 35,
    departureTime: "08:00",
  },
  {
    id: "6w-3",
    type: "6-wheel",
    name: "รถบรรทุก 6 ล้อ - คันที่ 3",
    capacityCBM: 32,
    fuelConsumption: 0.2,
    fixedCost: 450,
    color: "#3B82F6",
    fuelPrice: 35,
    departureTime: "08:00",
  },
  {
    id: "10w-1",
    type: "10-wheel",
    name: "รถบรรทุก 10 ล้อ - คันที่ 1",
    capacityCBM: 48,
    fuelConsumption: 0.28,
    fixedCost: 600,
    color: "#F97316",
    fuelPrice: 35,
    departureTime: "08:00",
  },
  {
    id: "10w-2",
    type: "10-wheel",
    name: "รถบรรทุก 10 ล้อ - คันที่ 2",
    capacityCBM: 48,
    fuelConsumption: 0.28,
    fixedCost: 600,
    color: "#F97316",
    fuelPrice: 35,
    departureTime: "08:00",
  },
  {
    id: "10w-3",
    type: "10-wheel",
    name: "รถบรรทุก 10 ล้อ - คันที่ 3",
    capacityCBM: 48,
    fuelConsumption: 0.28,
    fixedCost: 600,
    color: "#F97316",
    fuelPrice: 35,
    departureTime: "08:00",
  },
];

export function haversineKm(
  coord1: [number, number],
  coord2: [number, number],
): number {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const R = 6371; // Radius of the Earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Straight-line distance in km
}

export function getFallbackDist(
  coord1: [number, number],
  coord2: [number, number],
): number {
  // 1.3x fudge factor approximates road distance from straight-line distance.
  return haversineKm(coord1, coord2) * 1.3;
}

export async function getRoute(
  c1: [number, number],
  c2: [number, number],
  avgSpeedKmh: number,
): Promise<{ distance: number; duration: number; geometry: any }> {
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OSRM API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        distance: route.distance / 1000, // converted to km
        duration: route.duration, // seconds
        geometry: route.geometry,
      };
    }
    throw new Error("No valid route found");
  } catch (error) {
    console.warn("Fallback to Haversine for routing:", error);
    const dist = getFallbackDist(c1, c2);
    return {
      distance: dist,
      duration: (dist / avgSpeedKmh) * 3600, // standard duration computation via speed
      geometry: { type: "LineString", coordinates: [c1, c2] },
    };
  }
}

export function parseVehicleTime(timeStr: string, todayStr = new Date().toISOString().split('T')[0]): Date {
  const [h, m] = (timeStr || '08:00').split(':');
  return new Date(`${todayStr} ${(h ?? '08').padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`);
}

export function selectVehicleForRoute(
  routeVolume: number,
  availableFleet: Vehicle[],
  eligibleFleetPool: Vehicle[],
): Vehicle {
  const eligibleIds = new Set(eligibleFleetPool.map((v) => v.id));
  const found = availableFleet.find((v) => eligibleIds.has(v.id) && v.capacityCBM >= routeVolume);
  if (found) return found;

  const suitable = eligibleFleetPool.filter((v) => v.capacityCBM >= routeVolume);
  const pool = suitable.length > 0 ? suitable : eligibleFleetPool;
  return [...pool].sort((a, b) => a.capacityCBM - b.capacityCBM)[0];
}

export async function processData(
  nodes: RouteNode[],
  paramsWithoutStartTime: Omit<ProcessingParams, 'startTime'>,
): Promise<ProcessedData> {
  const depot = nodes[0];

  const todayStr = new Date().toISOString().split('T')[0];
  const parseVehicleTimeToday = (timeStr: string) => parseVehicleTime(timeStr, todayStr);
  const earliestDepartureTime = paramsWithoutStartTime.fleetPool.length > 0
    ? paramsWithoutStartTime.fleetPool.reduce(
        (min, v) => {
          const t = parseVehicleTimeToday(v.departureTime);
          return t < min ? t : min;
        },
        parseVehicleTimeToday(paramsWithoutStartTime.fleetPool[0].departureTime),
      )
    : new Date(`${todayStr} 08:00`);

  const params: ProcessingParams = { ...paramsWithoutStartTime, startTime: earliestDepartureTime };

  let traditionalDistance = 0;
  let traditionalCO2 = 0;
  let totalVolume = 0;
  let totalWeight = 0;

  // Helper to find the smallest vehicle that fits the volume
  const getSmallestVehicle = (volume: number, fleet: Vehicle[]) => {
    let suitable = fleet.filter((v) => v.capacityCBM >= volume);
    if (suitable.length === 0) {
      // Fallback to the largest available if nothing fits (or all pool if empty)
      suitable = fleet.length > 0 ? fleet : [...params.fleetPool];
    }
    suitable.sort((a, b) => a.capacityCBM - b.capacityCBM);
    return suitable[0];
  };

  // Same as getSmallestVehicle, but restricted to cold-storage vehicles for nodes that require one
  const getBaselineVehicle = (node: RouteNode) => {
    const vol = isNaN(node.demandVolume) ? 0 : node.demandVolume;
    const eligible = node.requiresColdStorage
      ? params.fleetPool.filter((v) => v.type === 'cold-storage')
      : [...params.fleetPool];
    return getSmallestVehicle(vol, eligible.length > 0 ? eligible : [...params.fleetPool]);
  };

  let traditionalCost = 0;

  // Calculate traditional back-and-forth distance and CO2
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    const dist = getFallbackDist([depot.lon, depot.lat], [node.lon, node.lat]);
    const roundTripDist = dist * 2;
    traditionalDistance += roundTripDist;
    const vol = isNaN(node.demandVolume) ? 0 : node.demandVolume;
    totalVolume += vol;
    totalWeight += node.weight || 0;

    const baselineVehicle = getBaselineVehicle(node);
    traditionalCO2 +=
      (2621 * baselineVehicle.fuelConsumption * roundTripDist) / 1000;

    const durationSec = (dist / params.avgSpeed) * 3600;
    const arrivalTime = addSeconds(params.startTime, durationSec);
    let waitMin = 0;
    if (node.readyTime && isBefore(arrivalTime, node.readyTime)) {
      waitMin = (node.readyTime.getTime() - arrivalTime.getTime()) / 60000;
    }

    traditionalCost +=
      roundTripDist *
        baselineVehicle.fuelConsumption *
        baselineVehicle.fuelPrice +
      (waitMin / 60) * params.driverWage +
      baselineVehicle.fixedCost;
  }

  // 1-3. PARTITIONED ROUTE-BUILD + BEST-FIT ASSIGNMENT
  // Cold-required stops are routed as their own group, restricted to cold-storage
  // vehicles for both the capacity ceiling used during route construction and for
  // vehicle assignment. Regular stops are routed exactly as before. Both groups
  // draw from one shared, mutable `availableFleet` so a vehicle is never double-booked
  // across groups.
  async function processGroup(
    groupNodes: RouteNode[],
    groupParams: ProcessingParams,
    availableFleet: Vehicle[],
    startRouteIndex: number,
  ): Promise<{
    legs: RouteLeg[];
    summaries: RouteSummary[];
    distance: number;
    co2: number;
    cost: number;
    waitingMinutes: number;
    nextRouteIndex: number;
  }> {
    const groupDepot = groupNodes[0];

    function buildGroupRoutes(): number[][] {
      switch (groupParams.algorithm) {
        case 'nearest-neighbor': return nearestNeighbor(groupNodes, groupParams);
        case 'sweep': return sweep(groupNodes, groupParams);
        case 'or-opt-sa': return orOptAnnealing(groupNodes, groupParams);
        case 'solomon-i1': return solomonI1(groupNodes, groupParams);
        default: return clarkWrightSavings(groupNodes, groupParams);
      }
    }

    let routes = buildGroupRoutes();
    if (groupParams.applyTwoOpt) {
      routes = routes.map((r) => twoOptFeasible(r, groupNodes, groupParams));
    }

    const legs: RouteLeg[] = [];
    const summaries: RouteSummary[] = [];
    let distance = 0;
    let co2 = 0;
    let cost = 0;
    let waitingMinutes = 0;
    let routeIndex = startRouteIndex;

    for (const routeSeq of routes) {
      let routeVolume = 0;
      for (const idx of routeSeq) {
        routeVolume += isNaN(groupNodes[idx].demandVolume) ? 0 : groupNodes[idx].demandVolume;
      }

      const assignedVehicle = selectVehicleForRoute(routeVolume, availableFleet, groupParams.fleetPool);
      const vIndex = availableFleet.findIndex((v) => v.id === assignedVehicle.id);
      if (vIndex !== -1) availableFleet.splice(vIndex, 1);

      let currentTime = parseVehicleTimeToday(assignedVehicle.departureTime);
      let currentLoc = groupDepot;
      let routeDistance = 0;
      let routeWaitingMinutes = 0;

      for (const idx of routeSeq) {
        const node = groupNodes[idx];
        const routeRes = await getRoute(
          [currentLoc.lon, currentLoc.lat],
          [node.lon, node.lat],
          groupParams.avgSpeed,
        );

        routeDistance += routeRes.distance;
        const arrivalTime = addSeconds(currentTime, routeRes.duration);

        let waitingMin = 0;
        let departureTime = arrivalTime;
        if (node.readyTime && isBefore(arrivalTime, node.readyTime)) {
          waitingMin = (node.readyTime.getTime() - arrivalTime.getTime()) / 60000;
          departureTime = node.readyTime;
        }
        routeWaitingMinutes += waitingMin;
        waitingMinutes += waitingMin;

        let status: 'On-Time' | 'Delayed' | 'N/A' = 'N/A';
        if (node.dueTime) {
          status = arrivalTime.getTime() > node.dueTime.getTime() ? 'Delayed' : 'On-Time';
        }

        legs.push({
          fromNode: currentLoc,
          toNode: node,
          distanceKm: routeRes.distance,
          durationSec: routeRes.duration,
          arrivalDate: arrivalTime,
          waitingMinutes: waitingMin,
          status,
          geometry: routeRes.geometry,
          routeIndex,
        });

        currentTime = addSeconds(departureTime, 30 * 60);
        currentLoc = node;
      }

      const returnRoute = await getRoute(
        [currentLoc.lon, currentLoc.lat],
        [groupDepot.lon, groupDepot.lat],
        groupParams.avgSpeed,
      );
      routeDistance += returnRoute.distance;

      legs.push({
        fromNode: currentLoc,
        toNode: groupDepot,
        distanceKm: returnRoute.distance,
        durationSec: returnRoute.duration,
        arrivalDate: null,
        waitingMinutes: 0,
        status: 'N/A',
        geometry: returnRoute.geometry,
        isReturnToDepot: true,
        routeIndex,
      });

      distance += routeDistance;
      const routeCO2 = (2621 * assignedVehicle.fuelConsumption * routeDistance) / 1000;
      co2 += routeCO2;
      cost +=
        routeDistance * assignedVehicle.fuelConsumption * assignedVehicle.fuelPrice +
        (routeWaitingMinutes / 60) * groupParams.driverWage +
        assignedVehicle.fixedCost;

      summaries.push({
        routeIndex,
        totalVolume: routeVolume,
        volumeUtilization: (routeVolume / assignedVehicle.capacityCBM) * 100,
        distanceKm: routeDistance,
        vehicle: assignedVehicle,
      });

      routeIndex++;
    }

    return { legs, summaries, distance, co2, cost, waitingMinutes, nextRouteIndex: routeIndex };
  }

  const coldCustomers = nodes.slice(1).filter((n) => n.requiresColdStorage);
  const regularCustomers = nodes.slice(1).filter((n) => !n.requiresColdStorage);

  const availableFleet = [...params.fleetPool].sort((a, b) => a.capacityCBM - b.capacityCBM);

  let milkRunDistance = 0;
  let milkRunCO2 = 0;
  let milkRunCost = 0;
  let totalWaitingMinutes = 0;
  const globalLegs: RouteLeg[] = [];
  const routeSummaries: RouteSummary[] = [];
  let routeIndex = 1;

  if (coldCustomers.length > 0) {
    const coldParams: ProcessingParams = {
      ...params,
      fleetPool: params.fleetPool.filter((v) => v.type === 'cold-storage'),
    };
    const result = await processGroup([depot, ...coldCustomers], coldParams, availableFleet, routeIndex);
    globalLegs.push(...result.legs);
    routeSummaries.push(...result.summaries);
    milkRunDistance += result.distance;
    milkRunCO2 += result.co2;
    milkRunCost += result.cost;
    totalWaitingMinutes += result.waitingMinutes;
    routeIndex = result.nextRouteIndex;
  }

  if (regularCustomers.length > 0) {
    const result = await processGroup([depot, ...regularCustomers], params, availableFleet, routeIndex);
    globalLegs.push(...result.legs);
    routeSummaries.push(...result.summaries);
    milkRunDistance += result.distance;
    milkRunCO2 += result.co2;
    milkRunCost += result.cost;
    totalWaitingMinutes += result.waitingMinutes;
    routeIndex = result.nextRouteIndex;
  }

  // 4. UI METRICS SYNCHRONIZATION
  const savingsPercentage =
    traditionalDistance > 0
      ? ((traditionalDistance - milkRunDistance) / traditionalDistance) * 100
      : 0;
  const palletCount = Math.ceil(totalVolume / 1.2);

  const spaceUtilization =
    routeSummaries.length > 0
      ? routeSummaries.reduce((acc, r) => acc + r.volumeUtilization, 0) /
        routeSummaries.length
      : 0;

  const co2ReductionPercent =
    traditionalCO2 > 0
      ? ((traditionalCO2 - milkRunCO2) / traditionalCO2) * 100
      : 0;

  let traditionalFuel = 0;
  for (let i = 1; i < nodes.length; i++) {
    const v = getBaselineVehicle(nodes[i]);
    traditionalFuel +=
      getFallbackDist([depot.lon, depot.lat], [nodes[i].lon, nodes[i].lat]) *
      2 *
      v.fuelConsumption;
  }
  let milkRunFuel = routeSummaries.reduce(
    (acc, r) => acc + r.distanceKm * r.vehicle.fuelConsumption,
    0,
  );
  const fuelSavedLiters = traditionalFuel - milkRunFuel;

  return {
    nodes,
    legs: globalLegs,
    traditionalDistance,
    milkRunDistance,
    traditionalCost,
    milkRunCost,
    savingsPercentage,
    totalVolume,
    totalWeight,
    palletCount,
    spaceUtilization,
    traditionalCO2,
    milkRunCO2,
    fuelSavedLiters,
    co2ReductionPercent,
    totalWaitingHours: totalWaitingMinutes / 60,
    totalTrucksUsed: routeSummaries.length,
    routeSummaries,
    departureTime: params.startTime,
  };
}
