import { Vehicle, ProcessedData, OptimizationCriterion, RouteNode, RouteLeg, RouteSummary } from '../types';

const BASE = '/api';

export interface FleetConfig {
  vehicles: Vehicle[];
  driverWage: number;
  enableColdStorage: boolean;
}

export type ProgressStepState = 'unconfirmed' | 'pending' | 'in_transit' | 'completed';

export interface ProgressEntry {
  routeIndex: number;
  currentStep: number;
  stepState: ProgressStepState;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || 'Request failed');
  }
  return res.json();
}

export async function getFleet(): Promise<FleetConfig> {
  return request<FleetConfig>('/fleet');
}

export async function saveFleet(config: FleetConfig): Promise<void> {
  await request('/fleet', { method: 'PUT', body: JSON.stringify(config) });
}

export async function saveActivePlan(optimizationCriterion: OptimizationCriterion, data: ProcessedData): Promise<void> {
  await request('/plan', { method: 'POST', body: JSON.stringify({ optimizationCriterion, data }) });
}

function reviveNode(node: RouteNode): RouteNode {
  return {
    ...node,
    readyTime: node.readyTime ? new Date(node.readyTime as unknown as string) : null,
    dueTime: node.dueTime ? new Date(node.dueTime as unknown as string) : null,
  };
}

function reviveLeg(leg: RouteLeg): RouteLeg {
  return {
    ...leg,
    fromNode: reviveNode(leg.fromNode),
    toNode: reviveNode(leg.toNode),
    arrivalDate: leg.arrivalDate ? new Date(leg.arrivalDate as unknown as string) : null,
  };
}

export async function getActivePlan(): Promise<{ plan: ProcessedData; progress: ProgressEntry | null } | null> {
  const { plan, progress } = await request<{ plan: ProcessedData | null; progress: ProgressEntry | null }>('/plan/active');
  if (!plan) return null;
  return {
    plan: {
      ...plan,
      nodes: plan.nodes.map(reviveNode),
      legs: plan.legs.map(reviveLeg),
    },
    progress: progress ?? null,
  };
}

export async function getProgress(): Promise<ProgressEntry[]> {
  return request<ProgressEntry[]>('/plan/progress');
}

export async function postProgress(routeIndex: number, currentStep: number, stepState: ProgressStepState): Promise<void> {
  await request('/plan/progress', { method: 'POST', body: JSON.stringify({ routeIndex, currentStep, stepState }) });
}

export interface CurrentUser {
  id: string;
  username: string;
  role: 'admin' | 'driver';
  displayName: string;
}

export interface DriverAccount {
  id: string;
  username: string;
  displayName: string;
  vehicleId: string | null;
  vehicleName: string | null;
}

export async function login(username: string, password: string): Promise<CurrentUser> {
  return request<CurrentUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<CurrentUser> {
  return request<CurrentUser>('/auth/me');
}

export async function getDrivers(): Promise<DriverAccount[]> {
  return request<DriverAccount[]>('/drivers');
}

export async function createDriver(username: string, password: string, displayName: string): Promise<DriverAccount> {
  return request<DriverAccount>('/drivers', { method: 'POST', body: JSON.stringify({ username, password, displayName }) });
}

export async function updateDriver(id: string, updates: { password?: string; displayName?: string }): Promise<void> {
  await request(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export async function deleteDriver(id: string): Promise<void> {
  await request(`/drivers/${id}`, { method: 'DELETE' });
}

export async function getMyRoute(): Promise<{ routeSummary: RouteSummary; legs: RouteLeg[] } | null> {
  const { route } = await request<{ route: { routeSummary: RouteSummary; legs: RouteLeg[] } | null }>('/plan/my-route');
  if (!route) return null;
  return { routeSummary: route.routeSummary, legs: route.legs.map(reviveLeg) };
}

export async function postLocation(lat: number, lon: number): Promise<void> {
  await request('/plan/location', { method: 'POST', body: JSON.stringify({ lat, lon }) });
}

export interface DriverLocation {
  userId: string;
  displayName: string;
  vehicleId: string | null;
  vehicleName: string | null;
  lat: number;
  lon: number;
  updatedAt: string;
}

export async function getLocations(): Promise<DriverLocation[]> {
  return request<DriverLocation[]>('/plan/locations');
}
