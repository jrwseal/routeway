import type { RouteNode } from '../types';

/** Stable identity for a delivery point across re-optimizations (array index `id` is not). */
export function nodeKey(node: RouteNode): string {
  return `${node.location}|${node.lat}|${node.lon}`;
}
