import React from 'react';
import { ProcessedData } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { BarChart, Leaf, Truck } from 'lucide-react';

interface StatisticsCarProps {
  data: ProcessedData;
}

export default function StatisticsCar({ data }: StatisticsCarProps) {
  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in bg-slate-50">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#1E3A8A] mb-2 flex items-center">
          <BarChart className="w-8 h-8 mr-3" />
          Statistics Car
        </h1>
        <p className="text-slate-600">Environmental Savings and Fleet Log (Advisor Formula)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* SECTION B: Environmental Comparison */}
        <Card className="shadow-md border-0 lg:col-span-2 bg-gradient-to-br from-blue-900 to-[#1E3A8A] text-white">
          <CardHeader>
            <CardTitle className="text-white flex items-center text-xl">
              <Leaf className="w-6 h-6 mr-2" />
              เปรียบเทียบผลลัพธ์ (Before vs After)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm border border-white/20">
                <p className="text-blue-200 font-medium mb-1">Total Distance Saved</p>
                <p className="text-3xl font-bold">{(data.traditionalDistance - data.milkRunDistance).toFixed(2)} km</p>
              </div>
              <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm border border-white/20">
                <p className="text-blue-200 font-medium mb-1">Total Carbon Reduced</p>
                <p className="text-3xl font-bold">{(data.traditionalCO2 - data.milkRunCO2).toFixed(2)} kg CO₂</p>
              </div>
              <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm border border-white/20">
                <p className="text-blue-200 font-medium mb-1">Reduction Percentage</p>
                <p className="text-4xl font-black text-emerald-400">
                  {data.co2ReductionPercent.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION A: Individual Truck Breakdown */}
        <Card className="shadow-md border-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-[#1E3A8A] flex items-center text-xl">
              <Truck className="w-6 h-6 mr-2" />
              สถิติรายคัน (Individual Truck Breakdown)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.routeSummaries.map((route, idx) => {
                const fuelConsumption = route.vehicle.fuelConsumption;
                const fuelUsed = route.distanceKm * fuelConsumption;
                const co2Emitted = (2621 * fuelConsumption * route.distanceKm) / 1000;
                
                return (
                  <div key={idx} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                      <h3 className="font-bold text-lg text-[#1E3A8A]">Route {route.routeIndex}</h3>
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full text-center">
                        {route.vehicle.name}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-sm">Distance</span>
                        <span className="font-semibold text-slate-800">{route.distanceKm.toFixed(2)} km</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-sm">Fuel Used</span>
                        <span className="font-semibold text-slate-800">{fuelUsed.toFixed(2)} L</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-sm">Carbon Emitted</span>
                        <span className="font-semibold text-emerald-600">{co2Emitted.toFixed(2)} kg CO₂</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
