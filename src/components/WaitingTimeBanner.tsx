import React from 'react';
import { format } from 'date-fns';
import { ProcessedData } from '../types';
import { getPerVehicleWaitingAdvisories, VehicleWaitingAdvisory } from '../lib/waitingAdvisor';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface WaitingTimeBannerProps {
  data: ProcessedData;
  onApplyAdvisory?: (advisory: VehicleWaitingAdvisory) => void;
  applyingRouteIndex?: number | null;
}

export default function WaitingTimeBanner({ data, onApplyAdvisory, applyingRouteIndex = null }: WaitingTimeBannerProps) {
  const advisories = getPerVehicleWaitingAdvisories(data);
  if (advisories.length === 0) return null;

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
            {advisory.suggestedDepartureTime && onApplyAdvisory && (
              <button
                type="button"
                onClick={() => onApplyAdvisory(advisory)}
                disabled={isBusy}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-amber-warning-deep text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApplying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isApplying ? 'กำลังคำนวณ...' : 'ใช้เวลานี้'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
