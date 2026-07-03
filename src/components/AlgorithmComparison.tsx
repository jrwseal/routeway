import React from 'react';
import type { ComparisonResult } from '../types';

interface Props {
  data: ComparisonResult[];
}

function bestIdx(data: ComparisonResult[], key: keyof Pick<ComparisonResult, 'milkRunDistance' | 'milkRunCost' | 'milkRunCO2' | 'totalTrucksUsed'>): number {
  return data.reduce((bi, c, i) => (c[key] < data[bi][key] ? i : bi), 0);
}

export default function AlgorithmComparison({ data }: Props) {
  if (data.length === 0) return null;

  const bestDist = bestIdx(data, 'milkRunDistance');
  const bestCost = bestIdx(data, 'milkRunCost');
  const bestCO2 = bestIdx(data, 'milkRunCO2');
  const bestTrucks = bestIdx(data, 'totalTrucksUsed');

  const colClass = (rowIdx: number, metricBest: number) =>
    rowIdx === metricBest
      ? 'bg-emerald-50 text-emerald-800 font-bold'
      : 'text-slate-700';

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-[#1E3A8A] mb-1">Algorithm Comparison</h2>
      <p className="text-sm text-slate-500 mb-6">Green cell = best value per metric. Detail views use the lowest-cost result. Time window compliance (Due_Time) is only guaranteed with Clarke-Wright Savings.</p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[#1E3A8A] text-white">
              <th className="px-4 py-3 text-left font-semibold">Algorithm</th>
              <th className="px-4 py-3 text-left font-semibold">2-opt</th>
              <th className="px-4 py-3 text-right font-semibold">Distance (km)</th>
              <th className="px-4 py-3 text-right font-semibold">Cost (฿)</th>
              <th className="px-4 py-3 text-right font-semibold">CO₂ (kg)</th>
              <th className="px-4 py-3 text-right font-semibold">Trucks</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className={`border-t border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="px-4 py-3 font-medium text-slate-800">{row.algorithm}</td>
                <td className="px-4 py-3 text-slate-500">{row.twoOpt ? '✓' : '—'}</td>
                <td className={`px-4 py-3 text-right rounded ${colClass(i, bestDist)}`}>
                  {row.milkRunDistance.toFixed(1)}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
