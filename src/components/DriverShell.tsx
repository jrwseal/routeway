import React, { useEffect, useState } from 'react';
import { ProcessedData } from '../types';
import { getMyRoute, postProgress, logout, CurrentUser } from '../lib/api';
import DriverPortal from './DriverPortal';
import AppLogo from './AppLogo';
import { LogOut } from 'lucide-react';

interface DriverShellProps {
  user: CurrentUser;
  onLoggedOut: () => void;
}

export default function DriverShell({ user, onLoggedOut }: DriverShellProps) {
  const [data, setData] = useState<ProcessedData | null>(null);
  const [hasNoRoute, setHasNoRoute] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepState, setStepState] = useState<'pending' | 'in_transit'>('pending');

  useEffect(() => {
    let cancelled = false;
    getMyRoute()
      .then(route => {
        if (cancelled) return;
        if (!route) {
          setHasNoRoute(true);
          return;
        }
        setData({
          nodes: [],
          legs: route.legs,
          traditionalDistance: 0, milkRunDistance: 0, traditionalCost: 0, milkRunCost: 0, savingsPercentage: 0,
          totalVolume: 0, totalWeight: 0, palletCount: 0, spaceUtilization: 0,
          traditionalCO2: 0, milkRunCO2: 0, fuelSavedLiters: 0, co2ReductionPercent: 0,
          totalWaitingHours: 0, totalTrucksUsed: 1,
          routeSummaries: [route.routeSummary],
          departureTime: new Date(),
        });
      })
      .catch(() => setHasNoRoute(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    await logout().catch(() => {});
    onLoggedOut();
  };

  const topBar = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
      <div className="flex items-center gap-3">
        <AppLogo className="w-24" />
        <span className="text-sm font-semibold text-slate-600">{user.displayName}</span>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-alert-red"
      >
        <LogOut className="w-4 h-4" /> ออกจากระบบ
      </button>
    </div>
  );

  if (hasNoRoute) {
    return (
      <div className="min-h-screen bg-neutral-canvas">
        {topBar}
        <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
          ยังไม่ได้รับมอบหมายเส้นทาง กรุณาติดต่อผู้ดูแลระบบ
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-neutral-canvas">
        {topBar}
        <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
          กำลังโหลดเส้นทาง...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-canvas">
      {topBar}
      <DriverPortal
        data={data}
        currentStep={currentStep}
        setCurrentStep={setCurrentStep}
        stepState={stepState}
        setStepState={setStepState}
        lockedRouteIndex={data.routeSummaries[0].routeIndex}
        onStepChange={(routeIndex, step, state) => {
          postProgress(routeIndex, step, state).catch(() => {});
        }}
      />
    </div>
  );
}
