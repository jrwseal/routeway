import React, { useEffect, useState } from 'react';
import { ProcessedData } from '../types';
import { getActivePlan, postProgress } from '../lib/api';
import DriverPortal from './DriverPortal';
import { Loader2 } from 'lucide-react';

export default function DriverOnlyShell({ displayName, onLogout }: { displayName: string; onLogout: () => void }) {
  const [plan, setPlan] = useState<ProcessedData | null | 'loading'>('loading');
  const [currentStep, setCurrentStep] = useState(0);
  const [stepState, setStepState] = useState<'pending' | 'in_transit'>('pending');

  useEffect(() => {
    getActivePlan().then(result => {
      if (!result) {
        setPlan(null);
        return;
      }
      setPlan(result.plan);
      if (result.progress) {
        setCurrentStep(result.progress.currentStep);
        setStepState(result.progress.stepState as 'pending' | 'in_transit');
      }
    });
  }, []);

  if (plan === 'loading') {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-neutral-canvas">
        <Loader2 className="w-10 h-10 text-fleet-navy animate-spin" />
      </div>
    );
  }

  const routeIndex = plan?.routeSummaries[0]?.routeIndex;

  return (
    <div className="h-screen w-full flex flex-col bg-neutral-canvas">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <span className="text-lg font-bold text-fleet-navy">RouteWay — {displayName}</span>
        <button onClick={onLogout} className="text-sm font-medium text-slate-500 hover:text-fleet-navy">
          ออกจากระบบ
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!plan || routeIndex === undefined ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <h1 className="text-2xl font-bold text-fleet-navy mb-2">ยังไม่ได้รับมอบหมายรถ</h1>
            <p className="text-slate-600">กรุณาติดต่อ planner เพื่อรับมอบหมายรถและเส้นทาง</p>
          </div>
        ) : (
          <DriverPortal
            data={plan}
            currentStep={currentStep}
            setCurrentStep={setCurrentStep}
            stepState={stepState}
            setStepState={setStepState}
            lockedRouteIndex={routeIndex}
            onStepChange={(idx, step, state) => postProgress(idx, step, state)}
          />
        )}
      </div>
    </div>
  );
}
