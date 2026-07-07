import { Vehicle, ProcessedData, OptimizationCriterion, RouteNode, RouteLeg } from '../types';

const BASE = '/api';

export interface FleetConfig {
  vehicles: Vehicle[];
  driverWage: number;
}

export interface ProgressEntry {
  routeIndex: number;
  currentStep: number;
  stepState: 'pending' | 'in_transit';
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

export async function postProgress(routeIndex: number, currentStep: number, stepState: 'pending' | 'in_transit'): Promise<void> {
  await request('/plan/progress', { method: 'POST', body: JSON.stringify({ routeIndex, currentStep, stepState }) });
}
