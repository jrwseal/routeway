export interface RouteNode {
  id: number;
  location: string;
  lat: number;
  lon: number;
  demandVolume: number;
  weight: number;
  readyTime: Date | null;
  dueTime: Date | null;
  originalReadyString?: string;
  originalDueString?: string;
}

export interface Vehicle {
  id: string;
  type: string;
  name: string;
  capacityCBM: number;
  fuelConsumption: number;
  color: string;
}

export interface RouteLeg {
  fromNode: RouteNode;
  toNode: RouteNode;
  distanceKm: number;
  durationSec: number;
  arrivalDate: Date | null;
  waitingMinutes: number;
  status: 'On-Time' | 'Delayed' | 'N/A';
  geometry: any;
  isReturnToDepot?: boolean;
  routeIndex: number;
}

export interface RouteSummary {
  routeIndex: number;
  totalVolume: number;
  volumeUtilization: number;
  distanceKm: number;
  vehicle: Vehicle;
}

export interface ProcessingParams {
  fleetPool: Vehicle[];
  avgSpeed: number;
  startTime: Date;
  driverWage: number;
  fuelPrice4W: number;
  fuelPrice6W: number;
  fuelPrice10W: number;
  algorithm: 'savings' | 'nearest-neighbor' | 'sweep' | 'or-opt-sa';
  applyTwoOpt: boolean;
}

export interface ComparisonResult {
  algorithm: string;
  twoOpt: boolean;
  milkRunDistance: number;
  milkRunCost: number;
  milkRunCO2: number;
  totalTrucksUsed: number;
}

export interface ProcessedData {
  nodes: RouteNode[];
  legs: RouteLeg[];
  traditionalDistance: number;
  milkRunDistance: number;
  traditionalCost: number;
  milkRunCost: number;
  savingsPercentage: number;
  totalVolume: number;
  totalWeight: number;
  palletCount: number;
  spaceUtilization: number;
  traditionalCO2: number;
  milkRunCO2: number;
  fuelSavedLiters: number;
  co2ReductionPercent: number;
  totalWaitingHours: number;
  totalTrucksUsed: number;
  routeSummaries: RouteSummary[];
}
