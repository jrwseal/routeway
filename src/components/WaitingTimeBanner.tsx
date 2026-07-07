import React from 'react';
import { format } from 'date-fns';
import { ProcessedData } from '../types';
import { getWaitingAdvisory } from '../lib/waitingAdvisor';
import { AlertTriangle } from 'lucide-react';

export default function WaitingTimeBanner({ data }: { data: ProcessedData }) {
  const advisory = getWaitingAdvisory(data);
  if (!advisory) return null;

  return (
    <div className="mb-6 bg-amber-50 border border-amber-warning rounded-lg px-4 py-3 flex items-start">
      <AlertTriangle className="w-5 h-5 text-amber-warning-deep mr-3 mt-0.5 flex-shrink-0" />
      <p className="text-sm text-amber-warning-deep font-medium">
        {advisory.suggestedDepartureTime ? (
          <>
            ⏱️ แผนนี้มีเวลารอรวม {advisory.totalWaitingHours.toFixed(1)} ชม.{' '}
            แนะนำเลื่อนเวลาออกเดินทางเป็น {format(advisory.suggestedDepartureTime, 'HH:mm')} เพื่อลดเวลารอ
          </>
        ) : (
          <>
            ⏱️ แผนนี้มีเวลารอรวม {advisory.totalWaitingHours.toFixed(1)} ชม. —
            ตารางเวลาปัจจุบันแน่นเกินกว่าจะเลื่อนเวลาออกเดินทางได้โดยไม่กระทบกำหนดส่งของจุดอื่น
          </>
        )}
      </p>
    </div>
  );
}
