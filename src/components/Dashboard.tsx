import React from "react";
import { ProcessedData } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import RouteMap from "./RouteMap";
import WaitingTimeBanner from "./WaitingTimeBanner";

interface DashboardProps {
  data: ProcessedData;
  savingsBaseline?: ProcessedData | null;
  onViewAlgorithm?: () => void;
}

export default function Dashboard({ data, savingsBaseline, onViewAlgorithm }: DashboardProps) {
  const baselineDistance = savingsBaseline ? savingsBaseline.milkRunDistance : data.traditionalDistance;
  const isSavingsBaseline = !!savingsBaseline;
  const distanceSavingsPct = baselineDistance > 0
    ? ((baselineDistance - data.milkRunDistance) / baselineDistance) * 100
    : 0;

  return (
    <div className="p-4 sm:p-8 pb-20 animate-fade-in w-full max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-fleet-navy mb-2">RouteWay</h1>
        <p className="text-lg font-medium text-slate-600">
          Dashboard & Savings Overview
        </p>
      </div>

      <WaitingTimeBanner data={data} />

      <RouteMap data={data} onViewAlgorithm={onViewAlgorithm} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 mt-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Total Stops
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-fleet-navy">
              {data.nodes.length - 1}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              {isSavingsBaseline ? 'Savings Dist (km)' : 'Traditional Dist (km)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-700">
              {baselineDistance.toFixed(1)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Optimized Dist (km)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-fleet-navy">
              {data.milkRunDistance.toFixed(1)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              {isSavingsBaseline ? 'vs Savings' : 'Distance Savings'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${distanceSavingsPct >= 0 ? 'text-signal-green' : 'text-red-600'}`}>
              {distanceSavingsPct > 0 ? '+' : ''}{distanceSavingsPct.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold text-fleet-navy">
              Capacity & Utilization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm font-medium mb-1">
                  <span>Truck Capacity/Pallet Utilization</span>
                  <span className="text-fleet-navy font-bold">
                    {data.spaceUtilization.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                  <div
                    className="bg-fleet-navy h-2.5 rounded-full"
                    style={{
                      width: `${Math.min(data.spaceUtilization, 100)}%`,
                    }}
                  ></div>
                </div>
              </div>

              <div className="pt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500 font-medium">
                    Total Volume (CBM)
                  </p>
                  <p className="text-xl font-bold text-slate-800">
                    {data.totalVolume.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">
                    Standard Pallets
                  </p>
                  <p className="text-xl font-bold text-slate-800">
                    {data.palletCount}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold text-fleet-navy">
              Logistics Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex items-start">
                <span className="mr-2 text-fleet-navy">●</span>
                <span>
                  จำนวนรถที่ใช้ (Total Active Trucks):{" "}
                  <strong>{data.totalTrucksUsed} คัน</strong>
                </span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-signal-green">●</span>
                <span>
                  Optimized Milk Run routing saves{" "}
                  <strong>{data.fuelSavedLiters.toFixed(2)} liters</strong> of
                  fuel per tour compared to traditional round trips.
                </span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-fleet-navy">●</span>
                <span>
                  The journey targets{" "}
                  <strong>{data.nodes.length - 1} customer drops</strong>{" "}
                  sequentially, adhering to delivery time windows.
                </span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-fleet-navy">●</span>
                <span>
                  Total Fleet Waiting Hours:{" "}
                  <strong>{data.totalWaitingHours.toFixed(2)} hours</strong>{" "}
                  accumulated by the fleet before ready times.
                </span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-fleet-navy">●</span>
                <span>
                  Capacity utilization is at{" "}
                  <strong>{data.spaceUtilization.toFixed(1)}%</strong>. Consider
                  consolidating additional nearby small deliveries if below 80%.
                </span>
              </li>
            </ul>

            <div className="mt-6">
              <h4 className="font-semibold text-sm text-fleet-navy mb-2">
                Volume Utilization per Truck
              </h4>
              <div className="space-y-2">
                {data.routeSummaries.map((route, i) => (
                  <div
                    key={i}
                    className="bg-slate-100 p-2 rounded text-xs flex justify-between"
                  >
                    <span>Truck {route.routeIndex}</span>
                    <span className="font-medium">
                      {route.totalVolume.toFixed(2)} CBM (
                      {route.volumeUtilization.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
