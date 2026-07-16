import React from 'react';
import type { ParcelExposureRow } from './selectors';
import VialGauge from './VialGauge';

export default function CareSidebar({ rows }: { rows: ParcelExposureRow[] }) {
  return (
    <aside
      className="w-80 flex-shrink-0 overflow-y-auto px-4 py-4 space-y-3"
      style={{ backgroundColor: 'var(--color-care-surface)', fontFamily: 'var(--font-care-body)' }}
    >
      {rows.length === 0 && (
        <p className="text-sm opacity-60" style={{ color: 'var(--color-care-ink)' }}>
          ไม่มีพัสดุที่ต้องควบคุมอุณหภูมิในแผนนี้
        </p>
      )}
      {rows.map(row => (
        <div
          key={row.parcel.id}
          className="rounded-lg px-3 py-3 bg-white flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <span className="text-sm font-medium truncate block" style={{ color: 'var(--color-care-ink)' }}>
              {row.parcel.name}
            </span>
          </div>
          <VialGauge
            elapsedMinutes={row.elapsedMinutes}
            maxMinutes={row.parcel.maxExposureMinutes}
            tier={row.parcel.tier}
            label={row.node.location}
          />
        </div>
      ))}
    </aside>
  );
}
