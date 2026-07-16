import React from 'react';
import type { Parcel } from '../types';

interface VialGaugeProps {
  elapsedMinutes: number;
  maxMinutes: number;
  label?: string;
  tier?: Parcel['tier'];
}

const TIER_DOT_COLOR: Record<string, string> = {
  critical: 'var(--color-care-critical)',
  standard: 'var(--color-care-warn)',
  low: 'var(--color-care-cool)',
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

const COOL = '#3EC1D3';
const WARN = '#FFC857';
const CRITICAL = '#F2545B';

function colorFor(ratio: number): string {
  if (ratio <= 0.6) return lerpColor(COOL, WARN, ratio / 0.6);
  return lerpColor(WARN, CRITICAL, Math.min((ratio - 0.6) / 0.4, 1));
}

export default function VialGauge({ elapsedMinutes, maxMinutes, label, tier }: VialGaugeProps) {
  const ratio = maxMinutes > 0 ? elapsedMinutes / maxMinutes : 0;
  const fillPercent = Math.min(Math.max(ratio, 0), 1) * 100;
  const expired = ratio >= 1;
  const remainingMinutes = Math.round(maxMinutes - elapsedMinutes);
  const fillColor = colorFor(ratio);

  return (
    <div className="flex items-center gap-3" style={{ fontFamily: 'var(--font-care-body)' }}>
      <div
        className="relative w-3 h-16 rounded-full overflow-hidden flex-shrink-0"
        style={{ backgroundColor: 'var(--color-care-surface)', border: '1px solid rgba(11,37,69,0.15)' }}
      >
        <div
          className={`absolute bottom-0 left-0 right-0 transition-all duration-500 ${expired ? 'animate-pulse' : ''}`}
          style={{ height: `${fillPercent}%`, backgroundColor: fillColor }}
        />
      </div>
      <div>
        {(label || tier) && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-care-ink)', opacity: 0.7 }}>
            {tier && (
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: TIER_DOT_COLOR[tier] ?? TIER_DOT_COLOR.low }}
              />
            )}
            {label}
          </div>
        )}
        <div
          className="text-sm font-semibold"
          style={{ fontFamily: 'var(--font-care-mono)', color: expired ? CRITICAL : 'var(--color-care-ink)' }}
        >
          {expired ? `เกิน ${Math.abs(remainingMinutes)} นาที` : `เหลือ ${remainingMinutes} นาที`}
        </div>
      </div>
    </div>
  );
}
