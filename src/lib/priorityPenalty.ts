import { TIER_WEIGHT } from './coldChainPenalty';
import type { RouteNode } from '../types';

const PENALTY_PER_POSITION = 5;

export function computePriorityPenalty(routes: number[][], nodes: RouteNode[]): number {
  let penalty = 0;

  for (const route of routes) {
    route.forEach((idx, position) => {
      const node = nodes[idx];
      for (const parcel of node.parcels ?? []) {
        const tierWeight = TIER_WEIGHT[parcel.tier] ?? 1;
        penalty += position * PENALTY_PER_POSITION * tierWeight;
      }
    });
  }

  return penalty;
}
