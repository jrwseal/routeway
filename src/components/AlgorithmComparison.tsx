import React from 'react';
import type { ComparisonResult } from '../types';

interface Props {
  data: ComparisonResult[];
  onSelectVariant: (idx: number) => void;
}

function bestIdx(data: ComparisonResult[], key: keyof Pick<ComparisonResult, 'milkRunDistance' | 'milkRunCost' | 'milkRunCO2' | 'totalTrucksUsed'>): number {
  return data.reduce((bi, c, i) => (c[key] < data[bi][key] ? i : bi), 0);
}

export default function AlgorithmComparison({ data, onSelectVariant }: Props) {
  if (data.length === 0) return null;

  const bestDist = bestIdx(data, 'milkRunDistance');
  const bestCost = bestIdx(data, 'milkRunCost');
  const bestCO2 = bestIdx(data, 'milkRunCO2');
  const bestTrucks = bestIdx(data, 'totalTrucksUsed');

  const savingsBaseline = data.find((r) => r.algorithm === 'Clarke-Wright' && !r.twoOpt) ?? data[0];
  const vsSavingsPct = (dist: number) =>
    savingsBaseline.milkRunDistance > 0
      ? ((savingsBaseline.milkRunDistance - dist) / savingsBaseline.milkRunDistance) * 100
      : 0;

  const colClass = (rowIdx: number, metricBest: number) =>
    rowIdx === metricBest
      ? 'bg-emerald-50 text-emerald-800 font-bold'
      : 'text-slate-700';

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-fleet-navy mb-1">Algorithm Comparison</h2>
      <p className="text-sm text-slate-500 mb-6">Green cell = best value per metric. Detail views use the lowest-cost result. Time window compliance (Due_Time) is guaranteed with Clarke-Wright Savings and Or-opt + SA.</p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-fleet-navy text-white">
              <th className="px-4 py-3 text-left font-semibold">Algorithm</th>
              <th className="px-4 py-3 text-left font-semibold">2-opt</th>
              <th className="px-4 py-3 text-right font-semibold">Distance (km)</th>
              <th className="px-4 py-3 text-right font-semibold">vs Savings</th>
              <th className="px-4 py-3 text-right font-semibold">Cost (฿)</th>
              <th className="px-4 py-3 text-right font-semibold">CO₂ (kg)</th>
              <th className="px-4 py-3 text-right font-semibold">Trucks</th>
              <th className="px-4 py-3 text-center font-semibold">Detail</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className={`border-t border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="px-4 py-3 font-medium text-slate-800">{row.algorithm}</td>
                <td className="px-4 py-3 text-slate-500">
                  {row.algorithm === 'Or-opt + SA' ? 'built-in' : row.twoOpt ? '✓' : '—'}
                </td>
                <td className={`px-4 py-3 text-right rounded ${colClass(i, bestDist)}`}>
                  {row.milkRunDistance.toFixed(1)}
                </td>
                <td className={`px-4 py-3 text-right ${vsSavingsPct(row.milkRunDistance) > 0 ? 'text-emerald-700' : vsSavingsPct(row.milkRunDistance) < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                  {row === savingsBaseline
                    ? 'baseline'
                    : `${vsSavingsPct(row.milkRunDistance) > 0 ? '+' : ''}${vsSavingsPct(row.milkRunDistance).toFixed(1)}%`}
                </td>
                <td className={`px-4 py-3 text-right rounded ${colClass(i, bestCost)}`}>
                  {row.milkRunCost.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                </td>
                <td className={`px-4 py-3 text-right rounded ${colClass(i, bestCO2)}`}>
                  {row.milkRunCO2.toFixed(1)}
                </td>
                <td className={`px-4 py-3 text-right rounded ${colClass(i, bestTrucks)}`}>
                  {row.totalTrucksUsed}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => onSelectVariant(i)}
                    className="px-3 py-1 text-xs font-bold rounded-lg bg-fleet-navy text-white hover:bg-blue-800 transition-colors"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
