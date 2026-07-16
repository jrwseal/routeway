import React, { useMemo } from 'react';
import type { ProcessedData } from '../types';
import RouteMap from '../components/RouteMap';
import CareHeader from './CareHeader';
import CareSidebar from './CareSidebar';
import { getParcelExposureRows, getExposureSummary } from './selectors';

export default function CareLayout({ data }: { data: ProcessedData }) {
  const rows = useMemo(() => getParcelExposureRows(data), [data]);
  const summary = useMemo(() => getExposureSummary(rows), [rows]);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--color-care-surface)' }}>
      <CareHeader onTimePercent={summary.onTimePercent} atRiskCount={summary.atRiskCount} />
      <div className="flex flex-1 min-h-0">
        <CareSidebar rows={rows} />
        <main className="flex-1 min-w-0">
          <RouteMap data={data} />
        </main>
      </div>
    </div>
  );
}
