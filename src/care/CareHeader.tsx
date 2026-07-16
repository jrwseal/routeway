import React from 'react';

interface CareHeaderProps {
  onTimePercent: number;
  atRiskCount: number;
}

export default function CareHeader({ onTimePercent, atRiskCount }: CareHeaderProps) {
  return (
    <header
      className="flex items-center justify-between px-6 py-4"
      style={{ backgroundColor: 'var(--color-care-navy)', color: '#fff' }}
    >
      <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-care-heading)' }}>
        RouteWay Care
      </h1>
      <div className="flex items-center gap-6" style={{ fontFamily: 'var(--font-care-mono)' }}>
        <div className="text-right">
          <div className="text-2xl font-semibold" style={{ color: 'var(--color-care-cool)' }}>
            {onTimePercent.toFixed(0)}%
          </div>
          <div className="text-xs opacity-70" style={{ fontFamily: 'var(--font-care-body)' }}>
            ส่งถึงในเวลาปลอดภัย
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-2xl font-semibold"
            style={{ color: atRiskCount > 0 ? 'var(--color-care-critical)' : 'var(--color-care-cool)' }}
          >
            {atRiskCount}
          </div>
          <div className="text-xs opacity-70" style={{ fontFamily: 'var(--font-care-body)' }}>
            พัสดุเสี่ยง
          </div>
        </div>
      </div>
    </header>
  );
}
