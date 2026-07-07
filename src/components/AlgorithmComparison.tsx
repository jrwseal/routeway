import React from 'react';
import type { ComparisonResult, OptimizationCriterion } from '../types';

interface Props {
  data: ComparisonResult[];
  onSelectVariant: (idx: number) => void;
  optimizationCriterion: OptimizationCriterion;
}

function bestIdx(data: ComparisonResult[], key: keyof Pick<ComparisonResult, 'milkRunDistance' | 'milkRunCost' | 'milkRunCO2' | 'milkRunWaitingHours' | 'totalTrucksUsed'>): number {
  return data.reduce((bi, c, i) => (c[key] < data[bi][key] ? i : bi), 0);
}

const CRITERION_LABEL: Record<OptimizationCriterion, string> = {
  cost: 'Min Cost',
  co2: 'Min CO2',
  distance: 'Min Distance',
  waiting: 'Min Waiting',
};

export default function AlgorithmComparison({ data, onSelectVariant, optimizationCriterion }: Props) {
  if (data.length === 0) return null;

  const bestDist = bestIdx(data, 'milkRunDistance');
  const bestCost = bestIdx(data, 'milkRunCost');
  const bestCO2 = bestIdx(data, 'milkRunCO2');
  const bestWaiting = bestIdx(data, 'milkRunWaitingHours');
  const bestTrucks = bestIdx(data, 'totalTrucksUsed');

  const bestByCriterion =
    optimizationCriterion === 'co2' ? bestCO2 :
    optimizationCriterion === 'distance' ? bestDist :
    optimizationCriterion === 'waiting' ? bestWaiting :
    bestCost;
  const winner = data[bestByCriterion];
  const winnerValue =
    optimizationCriterion === 'co2' ? `${winner.milkRunCO2.toFixed(1)} kg CO₂` :
    optimizationCriterion === 'distance' ? `${winner.milkRunDistance.toFixed(1)} km` :
    optimizationCriterion === 'waiting' ? `${winner.milkRunWaitingHours.toFixed(1)} h waiting` :
    `฿${winner.milkRunCost.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
  const winnerLabel = `${winner.algorithm}${winner.algorithm === 'Or-opt + SA' ? '' : winner.twoOpt ? ' (2-opt)' : ''}`;

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
    <div className="p-4 sm:p-6">
      <h2 className="text-2xl font-bold text-fleet-navy mb-1">Algorithm Comparison</h2>
      <p className="text-sm text-slate-500 mb-4">Green cell = best value per metric. Detail views use the {CRITERION_LABEL[optimizationCriterion].toLowerCase()} result. Time window compliance (Due_Time) is guaranteed with Clarke-Wright Savings and Or-opt + SA.</p>

      <div className="mb-6 bg-signal-green/10 border border-signal-green/30 rounded-lg px-4 py-3 flex items-center gap-2">
        <span className="text-lg" aria-hidden="true">🏆</span>
        <span className="text-sm text-slate-700">
          Best by {CRITERION_LABEL[optimizationCriterion]}: <strong className="text-slate-900">{winnerLabel}</strong> — <strong className="text-slate-900">{winnerValue}</strong>
        </span>
      </div>

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
              <th className="px-4 py-3 text-right font-semibold">Waiting (h)</th>
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
                <td className={`px-4 py-3 text-right rounded ${colClass(i, bestWaiting)}`}>
                  {row.milkRunWaitingHours.toFixed(1)}
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
