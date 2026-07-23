import React from 'react';
import { RouteLeg, RouteSummary } from '../types';
import { Card, CardContent } from './ui/card';
import { Truck, MapPin, Route as RouteIcon, Clock, Loader2 } from 'lucide-react';

interface RouteConfirmScreenProps {
  routeSummary: RouteSummary;
  legs: RouteLeg[];
  onConfirm: () => void;
  confirming?: boolean;
}

export default function RouteConfirmScreen({ routeSummary, legs, onConfirm, confirming = false }: RouteConfirmScreenProps) {
  const stopCount = legs.filter(l => !l.isReturnToDepot).length;
  const totalDistanceKm = legs.reduce((sum, l) => sum + l.distanceKm, 0);

  return (
    <div className="min-h-[calc(100vh-57px)] flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-md">
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <span
              className="inline-block w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: routeSummary.vehicle.color }}
            />
            <h1 className="text-xl font-bold text-fleet-navy">{routeSummary.vehicle.name}</h1>
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex items-start">
              <MapPin className="w-5 h-5 text-slate-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-500">จำนวนจุดส่ง</p>
                <p className="text-lg font-semibold text-slate-800">{stopCount} จุด</p>
              </div>
            </div>
            <div className="flex items-start">
              <RouteIcon className="w-5 h-5 text-slate-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-500">ระยะทางรวม</p>
                <p className="text-lg font-semibold text-slate-800">{totalDistanceKm.toFixed(1)} km</p>
              </div>
            </div>
            <div className="flex items-start">
              <Clock className="w-5 h-5 text-slate-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-500">เวลาออกเดินทาง</p>
                <p className="text-lg font-semibold text-slate-800">{routeSummary.vehicle.departureTime}</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="w-full bg-fleet-navy hover:bg-blue-800 text-white font-bold py-4 px-4 rounded-lg shadow-md transition-all active:scale-[0.98] flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {confirming ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Truck className="w-5 h-5 mr-2" />
            )}
            {confirming ? 'กำลังยืนยัน...' : 'ยืนยันรับงาน'}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
