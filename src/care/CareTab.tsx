import React, { useEffect, useMemo, useState } from 'react';
import type { ProcessedData, Vehicle } from '../types';
import { processData } from '../lib/geo';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import RouteMap from '../components/RouteMap';
import VialGauge from './VialGauge';
import TradeoffSlider from './TradeoffSlider';
import { getParcelExposureRows, getExposureSummary } from './selectors';

interface CareTabProps {
  data: ProcessedData;
  fleetPool: Vehicle[];
  avgSpeed: number;
  driverWage: number;
}

export default function CareTab({ data: initialData, fleetPool, avgSpeed, driverWage }: CareTabProps) {
  const [priorityWeight, setPriorityWeight] = useState(1);
  const [data, setData] = useState(initialData);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    let cancelled = false;
    processData(initialData.nodes, { fleetPool, avgSpeed, driverWage, algorithm: 'or-opt-sa', applyTwoOpt: false, priorityWeight }).then(result => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [initialData.nodes, fleetPool, avgSpeed, driverWage, priorityWeight]);

  const rows = useMemo(() => getParcelExposureRows(data), [data]);
  const summary = useMemo(() => getExposureSummary(rows), [rows]);

  return (
    <div className="p-4 sm:p-8 pb-20 animate-fade-in w-full max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-fleet-navy mb-2">RouteWay Care</h1>
        <p className="text-lg font-medium text-slate-600">Cold-chain exposure &amp; priority routing</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">On-time cold chain</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-fleet-navy">{summary.onTimePercent.toFixed(0)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Parcels at risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${summary.atRiskCount > 0 ? 'text-alert-red' : 'text-fleet-navy'}`}>
              {summary.atRiskCount}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <TradeoffSlider value={priorityWeight} onChange={setPriorityWeight} />
        </CardContent>
      </Card>

      <RouteMap data={data} />

      <div className="mt-8">
        <h2 className="text-xl font-bold text-fleet-navy mb-4">Parcels</h2>
        {rows.length === 0 ? (
          <p className="text-slate-500 text-sm">No parcels with cold-chain data in this manifest.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map(row => (
              <Card key={row.parcel.id}>
                <CardContent className="pt-6 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fleet-navy truncate">{row.parcel.name}</p>
                    <p className="text-xs text-slate-500 truncate">{row.node.location}</p>
                  </div>
                  <VialGauge elapsedMinutes={row.elapsedMinutes} maxMinutes={row.parcel.maxExposureMinutes} tier={row.parcel.tier} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
