import React, { useState } from 'react';
import { format } from 'date-fns';
import { ProcessedData, RouteLeg } from '../types';
import { getPerVehicleWaitingAdvisories, VehicleWaitingAdvisory } from '../lib/waitingAdvisor';
import { AlertTriangle, Loader2, Table2, X } from 'lucide-react';

interface WaitingTimeBannerProps {
  data: ProcessedData;
  onApplyAdvisory?: (advisory: VehicleWaitingAdvisory) => void;
  applyingRouteIndex?: number | null;
}

const STATUS_BADGE: Record<RouteLeg['status'], string> = {
  'On-Time': 'bg-green-bg-tint-solid text-[#047857]',
  Delayed: 'bg-red-100 text-red-700',
  'N/A': 'bg-slate-100 text-slate-500',
};

const STATUS_LABEL: Record<RouteLeg['status'], string> = {
  'On-Time': 'ตรงเวลา',
  Delayed: 'ล่าช้า',
  'N/A': '-',
};

function ScheduleModal({ advisory, legs, onClose }: { advisory: VehicleWaitingAdvisory; legs: RouteLeg[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: advisory.vehicle.color }}
            />
            <h2 className="font-bold text-fleet-navy text-lg">{advisory.vehicle.name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-left text-xs text-slate-500 uppercase">
                <th className="px-5 py-2 w-10">#</th>
                <th className="px-2 py-2">จุดส่ง</th>
                <th className="px-2 py-2 whitespace-nowrap">เวลาถึง</th>
                <th className="px-2 py-2 whitespace-nowrap">เวลารอ</th>
                <th className="px-5 py-2 whitespace-nowrap">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {legs.map((leg, index) => (
                <tr key={index} className="border-t border-slate-100">
                  <td className="px-5 py-2.5 text-slate-400">{index + 1}</td>
                  <td className="px-2 py-2.5 font-medium text-slate-700">
                    {leg.isReturnToDepot ? 'กลับคลัง' : leg.toNode.location}
                  </td>
                  <td className="px-2 py-2.5 text-slate-600 whitespace-nowrap">
                    {leg.arrivalDate ? format(leg.arrivalDate, 'HH:mm') : 'N/A'}
                  </td>
                  <td className="px-2 py-2.5 text-slate-600 whitespace-nowrap">
                    {Math.round(leg.waitingMinutes) > 0 ? `${Math.round(leg.waitingMinutes)} นาที` : '-'}
                  </td>
                  <td className="px-5 py-2.5">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_BADGE[leg.status]}`}>
                      {STATUS_LABEL[leg.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function WaitingTimeBanner({ data, onApplyAdvisory, applyingRouteIndex = null }: WaitingTimeBannerProps) {
  const advisories = getPerVehicleWaitingAdvisories(data);
  const [scheduleRouteIndex, setScheduleRouteIndex] = useState<number | null>(null);
  if (advisories.length === 0) return null;

  const scheduleAdvisory = advisories.find(a => a.routeIndex === scheduleRouteIndex) ?? null;
  const scheduleLegs = scheduleRouteIndex !== null
    ? data.legs.filter(leg => leg.routeIndex === scheduleRouteIndex)
    : [];

  return (
    <div className="mb-6 space-y-2">
      {advisories.map(advisory => {
        const isApplying = applyingRouteIndex === advisory.routeIndex;
        const isBusy = applyingRouteIndex !== null;
        return (
          <div
            key={advisory.routeIndex}
            className="bg-amber-50 border border-amber-warning rounded-lg px-4 py-3 flex items-start justify-between gap-3"
          >
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-amber-warning-deep mr-3 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-warning-deep font-medium">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                  style={{ backgroundColor: advisory.vehicle.color }}
                />
                <strong>{advisory.vehicle.name}</strong>{' '}
                {advisory.suggestedDepartureTime ? (
                  <>
                    มีเวลารอรวม {advisory.totalWaitingHours.toFixed(1)} ชม.{' '}
                    แนะนำเลื่อนเวลาออกเดินทางเป็น {format(advisory.suggestedDepartureTime, 'HH:mm')} เพื่อลดเวลารอ
                  </>
                ) : (
                  <>
                    มีเวลารอรวม {advisory.totalWaitingHours.toFixed(1)} ชม. —
                    ตารางเวลาปัจจุบันแน่นเกินกว่าจะเลื่อนเวลาออกเดินทางได้โดยไม่กระทบกำหนดส่งของจุดอื่น
                  </>
                )}
              </p>
            </div>
            <div className="flex-shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScheduleRouteIndex(advisory.routeIndex)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold border border-amber-warning-deep text-amber-warning-deep hover:bg-amber-100 transition-colors"
              >
                <Table2 className="w-3.5 h-3.5" />
                ดูตาราง
              </button>
              {advisory.suggestedDepartureTime && onApplyAdvisory && (
                <button
                  type="button"
                  onClick={() => onApplyAdvisory(advisory)}
                  disabled={isBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-amber-warning-deep text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isApplying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isApplying ? 'กำลังคำนวณ...' : 'ใช้เวลานี้'}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {scheduleAdvisory && (
        <ScheduleModal
          advisory={scheduleAdvisory}
          legs={scheduleLegs}
          onClose={() => setScheduleRouteIndex(null)}
        />
      )}
    </div>
  );
}
