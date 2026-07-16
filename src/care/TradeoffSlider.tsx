import React from 'react';

interface TradeoffSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export default function TradeoffSlider({ value, onChange, min = 0, max = 2, step = 0.1 }: TradeoffSliderProps) {
  return (
    <div className="px-4 py-3" style={{ fontFamily: 'var(--font-care-body)' }}>
      <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--color-care-ink)', opacity: 0.7 }}>
        <span>Cost-optimal</span>
        <span>Time-critical</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full"
        aria-label="Priority trade-off weight"
      />
      <div
        className="text-center text-xs mt-1"
        style={{ fontFamily: 'var(--font-care-mono)', color: 'var(--color-care-ink)' }}
      >
        priorityWeight: {value.toFixed(1)}
      </div>
    </div>
  );
}
