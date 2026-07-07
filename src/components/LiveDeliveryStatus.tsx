import React, { useEffect, useState } from 'react';
import { RouteSummary } from '../types';
import { getProgress, ProgressEntry } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Truck } from 'lucide-react';

const STEP_LABELS: Record<ProgressEntry['stepState'], string> = {
  pending: 'รอเริ่มส่ง',
  in_transit: 'กำลังไปส่ง',
};

export default function LiveDeliveryStatus({ routeSummaries }: { routeSummaries: RouteSummary[] }) {
  const [progress, setProgress] = useState<ProgressEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getProgress().then(entries => {
        if (!cancelled) setProgress(entries);
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (routeSummaries.length === 0) return null;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">สถานะการจัดส่งสด (Live Delivery Status)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {routeSummaries.map(summary => {
            const entry = progress.find(p => p.routeIndex === summary.routeIndex);
            return (
              <div key={summary.routeIndex} className="flex items-center justify-between border-b border-slate-100 last:border-0 py-2">
                <div className="flex items-center">
                  <Truck className="w-4 h-4 mr-2" style={{ color: summary.vehicle.color }} />
                  <span className="font-medium text-slate-700">{summary.vehicle.name}</span>
                </div>
                <span className="text-sm text-slate-500">
                  {entry ? `จุดที่ ${entry.currentStep + 1} — ${STEP_LABELS[entry.stepState]}` : 'ยังไม่มีข้อมูล'}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
