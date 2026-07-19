import type { RouteNode } from '../types';
import { nodeKey } from '../lib/nodeKey';
import type { DeliveryLogEntry } from './deliveryLog';

export interface NodeDeviationEntry {
  nodeKey: string;
  location: string;
  deviationMinutes: number; // actual - planned; positive = late
  timestamp: string;
  date: string;
}

/**
 * Turns Phase 2.5's per-parcel delivery log into per-delivery-point deviation
 * samples: how many minutes later (or earlier) than planned the driver
 * actually confirmed at this stop, this round.
 */
export function getNodeDeviations(nodes: RouteNode[], log: DeliveryLogEntry[]): NodeDeviationEntry[] {
  const nodeByParcelId = new Map<string, RouteNode>();
  for (const node of nodes) {
    for (const parcel of node.parcels ?? []) {
      nodeByParcelId.set(parcel.id, node);
    }
  }

  const entries: NodeDeviationEntry[] = [];
  for (const entry of log) {
    if (!entry.plannedTime) continue;
    const node = nodeByParcelId.get(entry.parcelId);
    if (!node) continue;
    const deviationMinutes = (new Date(entry.actualTime).getTime() - new Date(entry.plannedTime).getTime()) / 60000;
    entries.push({
      nodeKey: nodeKey(node),
      location: node.location,
      deviationMinutes,
      timestamp: entry.actualTime,
      date: entry.actualTime.slice(0, 10),
    });
  }
  return entries;
}

/**
 * Closed-loop learning: average the last N observed deviations per delivery
 * point so the next optimization pass can feed a calibrated travel-time
 * estimate back into computeExposurePenalty (see coldChainPenalty.ts) instead
 * of trusting the static haversine/avgSpeed guess forever.
 */
export function getMovingAverageDeviationByNode(entries: NodeDeviationEntry[], n = 5): Map<string, number> {
  const byNode = new Map<string, NodeDeviationEntry[]>();
  for (const e of entries) {
    const list = byNode.get(e.nodeKey) ?? [];
    list.push(e);
    byNode.set(e.nodeKey, list);
  }

  const result = new Map<string, number>();
  for (const [key, list] of byNode) {
    const chronological = [...list].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const lastN = chronological.slice(-n);
    const avg = lastN.reduce((sum, e) => sum + e.deviationMinutes, 0) / lastN.length;
    result.set(key, avg);
  }
  return result;
}

export interface AccuracyTrendPoint {
  date: string;
  avgAbsDeviationMinutes: number;
  count: number;
}

/** Average |planned - actual| per day — should trend down as more rounds feed the calibration loop. */
export function getAccuracyTrend(entries: NodeDeviationEntry[]): AccuracyTrendPoint[] {
  const byDate = new Map<string, NodeDeviationEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      avgAbsDeviationMinutes: items.reduce((sum, e) => sum + Math.abs(e.deviationMinutes), 0) / items.length,
      count: items.length,
    }));
}
