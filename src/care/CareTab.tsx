import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ProcessedData, Vehicle } from '../types';
import { processData } from '../lib/geo';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import RouteMap from '../components/RouteMap';
import VialGauge from './VialGauge';
import TradeoffSlider from './TradeoffSlider';
import { getParcelExposureRows, getExposureSummary } from './selectors';
import { getDeliveryLog, STORAGE_KEY } from './deliveryLog';
import { joinDeliveryOutcomes, getActualOnTimePercent, getDailyOnTimeTrend, getWasteReductionPercent } from './impactSelectors';
import { getNodeDeviations, getMovingAverageDeviationByNode, getAccuracyTrend } from './calibration';

interface CareTabProps {
  data: ProcessedData;
  fleetPool: Vehicle[];
  avgSpeed: number;
  driverWage: number;
}

export default function CareTab({ data: initialData, fleetPool, avgSpeed, driverWage }: CareTabProps) {
  const [priorityWeight, setPriorityWeight] = useState(1);
  const [data, setData] = useState(initialData);
  const [baselineData, setBaselineData] = useState<ProcessedData | null>(null);
  const [deliveryLog, setDeliveryLog] = useState(() => getDeliveryLog());

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Self-calibration (Phase 3.5): learn each stop's historical planned-vs-actual
  // delay from Phase 2.5 check-ins and feed it back in as a travel-time
  // adjustment for the *next* optimization pass — closes the loop without
  // touching the or-opt/SA search itself (see coldChainPenalty.ts).
  const nodeDeviations = useMemo(() => getNodeDeviations(initialData.nodes, deliveryLog), [initialData.nodes, deliveryLog]);
  const calibratedDelayByNodeKey = useMemo(() => getMovingAverageDeviationByNode(nodeDeviations, 5), [nodeDeviations]);
  const accuracyTrend = useMemo(() => getAccuracyTrend(nodeDeviations), [nodeDeviations]);

  useEffect(() => {
    let cancelled = false;
    processData(initialData.nodes, {
      fleetPool, avgSpeed, driverWage, algorithm: 'or-opt-sa', applyTwoOpt: false, priorityWeight,
      calibratedDelayByNodeKey,
    }).then(result => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [initialData.nodes, fleetPool, avgSpeed, driverWage, priorityWeight, calibratedDelayByNodeKey]);

  // Baseline for waste-reduction comparison: nearest-neighbor never looks at
  // cold-chain exposure, so it stands in for "no cold chain constraint".
  useEffect(() => {
    let cancelled = false;
    processData(initialData.nodes, { fleetPool, avgSpeed, driverWage, algorithm: 'nearest-neighbor', applyTwoOpt: false }).then(result => {
      if (!cancelled) setBaselineData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [initialData.nodes, fleetPool, avgSpeed, driverWage]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) setDeliveryLog(getDeliveryLog());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const rows = useMemo(() => getParcelExposureRows(data), [data]);
  const summary = useMemo(() => getExposureSummary(rows), [rows]);

  const outcomes = useMemo(() => joinDeliveryOutcomes(data, deliveryLog), [data, deliveryLog]);
  const actualOnTimePercent = useMemo(() => getActualOnTimePercent(outcomes), [outcomes]);
  const dailyTrend = useMemo(() => getDailyOnTimeTrend(outcomes), [outcomes]);
  const wasteReductionPercent = useMemo(
    () => (baselineData ? getWasteReductionPercent(data, baselineData) : null),
    [data, baselineData],
  );

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
        <h2 className="text-xl font-bold text-fleet-navy mb-4">Impact Dashboard</h2>
        {outcomes.length === 0 ? (
          <p className="text-slate-500 text-sm mb-6">
            ยังไม่มีข้อมูลส่งมอบจริงจาก driver check-in — ตัวเลขจะขึ้นเมื่อมีการยืนยันส่งมอบ
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">On-time cold chain (จริง)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-fleet-navy">{actualOnTimePercent.toFixed(0)}%</div>
                <p className="text-xs text-slate-500 mt-1">จาก {outcomes.length} พัสดุที่ยืนยันส่งมอบแล้ว</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">ลดความเสี่ยงพัสดุเสีย</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-signal-green">
                  {wasteReductionPercent === null ? '—' : `${wasteReductionPercent.toFixed(0)}%`}
                </div>
                <p className="text-xs text-slate-500 mt-1">เทียบ route ที่ optimize แล้ว vs. baseline ไม่มี cold-chain constraint</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">พัสดุที่ส่งมอบแล้ว</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-fleet-navy">{outcomes.length}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {dailyTrend.length > 1 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-fleet-navy">On-time % รายวัน</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyTrend} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="onTimePercent" stroke="#3EC1D3" strokeWidth={2} dot={{ r: 4 }} name="On-time %" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {accuracyTrend.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-bold text-fleet-navy">Self-calibration: ความแม่นยำของแผนต่อรอบ</CardTitle>
              <p className="text-xs text-slate-500">ค่าเฉลี่ยความคลาดเคลื่อนของแผน (นาที) ต่อวัน — ควรลดลงเมื่อระบบเรียนรู้จากรอบส่งของที่ผ่านมามากขึ้น</p>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={accuracyTrend} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="avgAbsDeviationMinutes" stroke="#F2545B" strokeWidth={2} dot={{ r: 4 }} name="เบี่ยงเบนเฉลี่ย (นาที)" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

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
