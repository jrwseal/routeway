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

export function getFallbackDist(
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
  const d = R * c; // Distance in km
  return d * 1.3;
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

export async function processData(
  nodes: RouteNode[],
  paramsWithoutStartTime: Omit<ProcessingParams, 'startTime'>,
): Promise<ProcessedData> {
  const depot = nodes[0];

  const todayStr = new Date().toISOString().split('T')[0];
  const parseVehicleTime = (timeStr: string) => {
    const [h, m] = timeStr.split(':');
    return new Date(`${todayStr} ${(h ?? '08').padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`);
  };
  const earliestDepartureTime = paramsWithoutStartTime.fleetPool.length > 0
    ? paramsWithoutStartTime.fleetPool.reduce(
        (min, v) => {
          const t = parseVehicleTime(v.departureTime);
          return t < min ? t : min;
        },
        parseVehicleTime(paramsWithoutStartTime.fleetPool[0].departureTime),
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

    const baselineVehicle = getSmallestVehicle(vol, [...params.fleetPool]);
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

  // 1. BUILD ROUTES via selected algorithm
  function buildRoutes(): number[][] {
    switch (params.algorithm) {
      case 'nearest-neighbor': return nearestNeighbor(nodes, params);
      case 'sweep': return sweep(nodes, params);
      case 'or-opt-sa': return orOptAnnealing(nodes, params);
      case 'solomon-i1': return solomonI1(nodes, params);
      default: return clarkWrightSavings(nodes, params);
    }
  }

  let routes = buildRoutes();
  if (params.applyTwoOpt) {
    routes = routes.map(r => twoOptFeasible(r, nodes, params));
  }

  // 3. BEST-FIT / GREEN FLEET SELECTION & CO2 CALCULATION
  let availableFleet = [...params.fleetPool].sort(
    (a, b) => a.capacityCBM - b.capacityCBM,
  );

  let milkRunDistance = 0;
  let milkRunCO2 = 0;
  let milkRunCost = 0;
  let totalWaitingMinutes = 0;
  const globalLegs: RouteLeg[] = [];
  const routeSummaries: RouteSummary[] = [];
  let routeIndex = 1;

  for (const routeSeq of routes) {
    let routeVolume = 0;
    for (const idx of routeSeq) {
      routeVolume += isNaN(nodes[idx].demandVolume)
        ? 0
        : nodes[idx].demandVolume;
    }

    let assignedVehicle = availableFleet.find(
      (v) => v.capacityCBM >= routeVolume,
    );
    if (!assignedVehicle) {
      assignedVehicle = getSmallestVehicle(routeVolume, [...params.fleetPool]);
    } else {
      const vIndex = availableFleet.findIndex(
        (v) => v.id === assignedVehicle.id,
      );
      if (vIndex !== -1) availableFleet.splice(vIndex, 1);
    }

    let currentTime = parseVehicleTime(assignedVehicle.departureTime);
    let currentLoc = depot;
    let routeDistance = 0;
    let routeWaitingMinutes = 0;

    for (const idx of routeSeq) {
      const node = nodes[idx];
      const routeRes = await getRoute(
        [currentLoc.lon, currentLoc.lat],
        [node.lon, node.lat],
        params.avgSpeed,
      );

      routeDistance += routeRes.distance;
      const arrivalTime = addSeconds(currentTime, routeRes.duration);

      let waitingMinutes = 0;
      let departureTime = arrivalTime;
      if (node.readyTime && isBefore(arrivalTime, node.readyTime)) {
        waitingMinutes =
          (node.readyTime.getTime() - arrivalTime.getTime()) / 60000;
        departureTime = node.readyTime;
      }
      routeWaitingMinutes += waitingMinutes;
      totalWaitingMinutes += waitingMinutes;

      let status: "On-Time" | "Delayed" | "N/A" = "N/A";
      if (node.dueTime) {
        if (arrivalTime.getTime() > node.dueTime.getTime()) {
          status = "Delayed";
        } else {
          status = "On-Time";
        }
      }

      globalLegs.push({
        fromNode: currentLoc,
        toNode: node,
        distanceKm: routeRes.distance,
        durationSec: routeRes.duration,
        arrivalDate: arrivalTime,
        waitingMinutes,
        status,
        geometry: routeRes.geometry,
        routeIndex,
      });

      currentTime = addSeconds(departureTime, 30 * 60);
      currentLoc = node;
    }

    const returnRoute = await getRoute(
      [currentLoc.lon, currentLoc.lat],
      [depot.lon, depot.lat],
      params.avgSpeed,
    );
    routeDistance += returnRoute.distance;

    globalLegs.push({
      fromNode: currentLoc,
      toNode: depot,
      distanceKm: returnRoute.distance,
      durationSec: returnRoute.duration,
      arrivalDate: null,
      waitingMinutes: 0,
      status: "N/A",
      geometry: returnRoute.geometry,
      isReturnToDepot: true,
      routeIndex,
    });

    milkRunDistance += routeDistance;
    const routeCO2 =
      (2621 * assignedVehicle.fuelConsumption * routeDistance) / 1000;
    milkRunCO2 += routeCO2;
    milkRunCost +=
      routeDistance *
        assignedVehicle.fuelConsumption *
        assignedVehicle.fuelPrice +
      (routeWaitingMinutes / 60) * params.driverWage +
      assignedVehicle.fixedCost;

    routeSummaries.push({
      routeIndex,
      totalVolume: routeVolume,
      volumeUtilization: (routeVolume / assignedVehicle.capacityCBM) * 100,
      distanceKm: routeDistance,
      vehicle: assignedVehicle,
    });

    routeIndex++;
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
    const vol = isNaN(nodes[i].demandVolume) ? 0 : nodes[i].demandVolume;
    const v = getSmallestVehicle(vol, [...params.fleetPool]);
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
