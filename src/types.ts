export interface RouteNode {
  id: number;
  location: string;
  lat: number;
  lon: number;
  demandVolume: number;
  weight: number;
  requiresColdStorage: boolean;
  readyTime: Date | null;
  dueTime: Date | null;
  originalReadyString?: string;
  originalDueString?: string;
  parcels?: Parcel[];
}

export interface Parcel {
  id: string;
  name: string;
  tier: 'critical' | 'standard' | 'low';
  maxExposureMinutes: number;
  requiredTemp: { min: number; max: number };
}

export interface Vehicle {
  id: string;
  type: string;
  name: string;
  capacityCBM: number;
  fuelConsumption: number;
  fixedCost: number;
  color: string;
  fuelPrice: number;
  departureTime: string;
  hasColdStorage?: boolean;
  coldStorageCapacity?: number;
  driverUserId?: string | null;
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

export type OptimizationCriterion = 'cost' | 'co2' | 'distance' | 'waiting';

export interface ProcessingParams {
  fleetPool: Vehicle[];
  avgSpeed: number;
  startTime: Date;
  driverWage: number;
  algorithm: 'savings' | 'nearest-neighbor' | 'sweep' | 'or-opt-sa' | 'solomon-i1';
  applyTwoOpt: boolean;
  priorityWeight?: number;
  /** Self-calibration (Care Phase 3.5): learned avg minutes late/early per delivery point, keyed by nodeKey(). */
  calibratedDelayByNodeKey?: Map<string, number>;
}

export interface ComparisonResult {
  algorithm: string;
  twoOpt: boolean;
  milkRunDistance: number;
  milkRunCost: number;
  milkRunCO2: number;
  milkRunWaitingHours: number;
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
  departureTime: Date;
}
