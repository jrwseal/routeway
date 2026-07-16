import React, { useEffect, useState } from 'react';
import type { ProcessedData, ProcessingParams, RouteNode } from '../types';
import { processData } from '../lib/geo';
import DriverCheckIn from './DriverCheckIn';
import { getParcelExposureRows } from './selectors';

type CareParams = Omit<ProcessingParams, 'startTime' | 'priorityWeight'>;

function LoadingScreen({ message }: { message: string }) {
  return (
    <div
      style={{ backgroundColor: 'var(--color-care-navy)', minHeight: '100vh', fontFamily: 'var(--font-care-body)' }}
      className="flex items-center justify-center text-white text-sm"
    >
      {message}
    </div>
  );
}

/** Runs the plan once and hands DriverCheckIn its first at-risk parcel — a demo entry point, not a route picker. */
export default function CareDriverDemo({ nodes, baseParams }: { nodes: RouteNode[]; baseParams: CareParams }) {
  const [data, setData] = useState<ProcessedData | null>(null);

  useEffect(() => {
    let cancelled = false;
    processData(nodes, baseParams).then(result => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [nodes, baseParams]);

  if (!data) {
    return <LoadingScreen message="กำลังวางแผนเส้นทาง..." />;
  }

  const rows = getParcelExposureRows(data);
  if (rows.length === 0) {
    return <LoadingScreen message="ไม่มีพัสดุให้ยืนยันส่งมอบในแผนนี้" />;
  }

  const targetRow = rows[0];
  const routeLegs = data.legs.filter(l => l.routeIndex === targetRow.routeIndex && !l.isReturnToDepot);
  const plannedLeg = routeLegs.find(l => l.toNode.id === targetRow.node.id);

  return (
    <DriverCheckIn
      target={{ node: targetRow.node, parcel: targetRow.parcel, plannedTime: plannedLeg?.arrivalDate ?? null }}
      routeLegs={routeLegs}
    />
  );
}
