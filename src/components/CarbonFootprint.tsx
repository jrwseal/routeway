import React from 'react';
import { ComparisonResult, ProcessedData } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface CarbonFootprintProps {
  data: ProcessedData;
  savingsBaseline?: ProcessedData | null;
  comparisonData?: ComparisonResult[] | null;
}

const routeFuelTotal = (d: ProcessedData) =>
  d.routeSummaries.reduce((acc, r) => acc + r.distanceKm * r.vehicle.fuelConsumption, 0);

const CURRENT_COLOR = '#1E3A8A';
const BEST_COLOR = '#10B981';
const OTHER_COLOR = '#94A3B8';

export default function CarbonFootprint({ data, savingsBaseline, comparisonData }: CarbonFootprintProps) {
  const baselineCO2 = savingsBaseline ? savingsBaseline.milkRunCO2 : data.traditionalCO2;
  const co2ReductionPct = baselineCO2 > 0
    ? ((baselineCO2 - data.milkRunCO2) / baselineCO2) * 100
    : 0;
  const fuelSaved = savingsBaseline
    ? routeFuelTotal(savingsBaseline) - routeFuelTotal(data)
    : data.fuelSavedLiters;

  const rawChartData = comparisonData && comparisonData.length > 0
    ? comparisonData.map((c) => ({
        name: `${c.algorithm}${c.twoOpt ? ' (2-opt)' : ''}`,
        rawCO2: c.milkRunCO2,
        CO2: Math.round(c.milkRunCO2),
        isCurrent: Math.abs(c.milkRunCO2 - data.milkRunCO2) < 1e-6,
      }))
    : [
        {
          name: savingsBaseline ? 'Clarke-Wright Savings' : 'Traditional Round Trips',
          rawCO2: baselineCO2,
          CO2: Math.round(baselineCO2),
          isCurrent: false,
        },
        {
          name: 'RouteWay Milk Run',
          rawCO2: data.milkRunCO2,
          CO2: Math.round(data.milkRunCO2),
          isCurrent: true,
        },
      ];
  const bestRawCO2 = Math.min(...rawChartData.map((c) => c.rawCO2));
  const chartData = rawChartData.map((c) => ({ ...c, isBest: Math.abs(c.rawCO2 - bestRawCO2) < 1e-6 }));

  return (
    <div className="p-4 sm:p-8 pb-20 animate-fade-in w-full max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-fleet-navy mb-2">RouteWay</h1>
        <p className="text-lg font-medium text-slate-600">Carbon Footprint Reduction</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Carbon Reduction</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold ${co2ReductionPct >= 0 ? 'text-signal-green' : 'text-red-600'}`}>{co2ReductionPct.toFixed(1)}%</div>
            <p className="text-sm text-slate-500 mt-2">
              {savingsBaseline ? 'Reduction in CO₂ emissions vs Clarke-Wright Savings' : 'Reduction in CO₂ emissions compared to traditional methods'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Fuel Liters Saved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold ${fuelSaved >= 0 ? 'text-fleet-navy' : 'text-red-600'}`}>{fuelSaved.toFixed(1)} L</div>
            <p className="text-sm text-slate-500 mt-2">Saved per complete manifest tour</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-fleet-navy">CO₂ Emissions Comparison (kg)</CardTitle>
          {comparisonData && comparisonData.length > 0 && (
            <p className="text-xs text-slate-500">
              <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ backgroundColor: BEST_COLOR }} />Best (lowest CO₂)
              <span className="inline-block w-2.5 h-2.5 rounded-sm ml-4 mr-1 align-middle" style={{ backgroundColor: CURRENT_COLOR }} />Currently viewed
              <span className="inline-block w-2.5 h-2.5 rounded-sm ml-4 mr-1 align-middle" style={{ backgroundColor: OTHER_COLOR }} />Other variants
            </p>
          )}
        </CardHeader>
        <CardContent className="h-72 sm:h-96 overflow-x-auto overflow-y-hidden">
          <div className="h-full" style={{ minWidth: chartData.length > 4 ? `${chartData.length * 90}px` : '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: '#F1F5F9' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend />
                <Bar dataKey="CO2" radius={[4, 4, 0, 0]} barSize={comparisonData && comparisonData.length > 0 ? 40 : 80}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.isBest ? BEST_COLOR : entry.isCurrent ? CURRENT_COLOR : OTHER_COLOR} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold text-fleet-navy">Methodology</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 leading-relaxed">
            The mathematical logic for estimating CO₂ emissions follows the standard logistics research formula:<br/><br/>
            <code className="bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono">CO₂ (kg) = (2621 × FC × Distance) / 1000</code><br/><br/>
            Where <strong>2621</strong> represents the average grams of CO₂ produced per liter of diesel fuel burned. <strong>FC</strong> denotes the dynamic Fuel Consumption rate (in L/km) of the specific vehicle class assigned to the route, and <strong>Distance</strong> is the total modeled route distance in kilometers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
