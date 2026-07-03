import React from 'react';
import { ProcessedData } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface CarbonFootprintProps {
  data: ProcessedData;
}

export default function CarbonFootprint({ data }: CarbonFootprintProps) {
  const chartData = [
    {
      name: 'Traditional Round Trips',
      CO2: Math.round(data.traditionalCO2),
    },
    {
      name: 'RouteWay Milk Run',
      CO2: Math.round(data.milkRunCO2),
    }
  ];

  return (
    <div className="p-8 pb-20 animate-fade-in w-full max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#1E3A8A] mb-2">RouteWay</h1>
        <p className="text-lg font-medium text-slate-600">Carbon Footprint Reduction</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Carbon Reduction</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-[#10B981]">{data.co2ReductionPercent.toFixed(1)}%</div>
            <p className="text-sm text-slate-500 mt-2">Reduction in CO₂ emissions compared to traditional methods</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Fuel Liters Saved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-[#1E3A8A]">{data.fuelSavedLiters.toFixed(1)} L</div>
            <p className="text-sm text-slate-500 mt-2">Saved per complete manifest tour</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8 hidden sm:block">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-[#1E3A8A]">CO₂ Emissions Comparison (kg)</CardTitle>
        </CardHeader>
        <CardContent className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{ fill: '#F1F5F9' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend />
              <Bar dataKey="CO2" fill="#1E3A8A" radius={[4, 4, 0, 0]} barSize={80} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold text-[#1E3A8A]">Methodology</CardTitle>
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
