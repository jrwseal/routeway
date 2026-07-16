import React, { useEffect, useMemo, useState } from 'react';
import type { ProcessedData, ProcessingParams, RouteNode } from '../types';
import { processData } from '../lib/geo';
import RouteMap from '../components/RouteMap';
import CareHeader from './CareHeader';
import CareSidebar from './CareSidebar';
import TradeoffSlider from './TradeoffSlider';
import { getParcelExposureRows, getExposureSummary } from './selectors';

type CareParams = Omit<ProcessingParams, 'startTime' | 'priorityWeight'>;

export default function CareLayout({ nodes, baseParams }: { nodes: RouteNode[]; baseParams: CareParams }) {
  const [priorityWeight, setPriorityWeight] = useState(1);
  const [data, setData] = useState<ProcessedData | null>(null);

  useEffect(() => {
    let cancelled = false;
    processData(nodes, { ...baseParams, priorityWeight }).then(result => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [nodes, baseParams, priorityWeight]);

  const rows = useMemo(() => (data ? getParcelExposureRows(data) : []), [data]);
  const summary = useMemo(() => getExposureSummary(rows), [rows]);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--color-care-surface)' }}>
      <CareHeader onTimePercent={summary.onTimePercent} atRiskCount={summary.atRiskCount} />
      <TradeoffSlider value={priorityWeight} onChange={setPriorityWeight} />
      <div className="flex flex-1 min-h-0">
        <CareSidebar rows={rows} />
        <main className="flex-1 min-w-0">
          {data && <RouteMap data={data} />}
        </main>
      </div>
    </div>
  );
}
