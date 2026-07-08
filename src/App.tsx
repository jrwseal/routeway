import React, { useState, useEffect } from 'react';
import { RouteNode, ProcessedData, ComparisonResult, OptimizationCriterion, Vehicle } from './types';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CarbonFootprint from './components/CarbonFootprint';
import DriverPortal from './components/DriverPortal';
import StatisticsCar from './components/StatisticsCar';
import AlgorithmComparison from './components/AlgorithmComparison';
import ComparisonPopup from './components/ComparisonPopup';
import LoginMockup from './components/LoginMockup';
import AppLogo from './components/AppLogo';
import { processData, DEFAULT_FLEET_POOL } from './lib/geo';
import { getFleet, saveActivePlan } from './lib/api';
import { validateColdStorageFleet } from './lib/coldStorageValidation';
import { AlertCircle, Loader2, Menu } from 'lucide-react';
import FleetConfigModal from './components/FleetConfigModal';

export default function App() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepState, setStepState] = useState<'pending' | 'in_transit'>('pending');
  // Configuration State
  const [activeFleetPool, setActiveFleetPool] = useState<Vehicle[]>([]);
  const [isFleetConfigOpen, setIsFleetConfigOpen] = useState(false);
  const [avgSpeed, setAvgSpeed] = useState(50);
  const [driverWaitingWage, setDriverWaitingWage] = useState(60);

  const [pendingNodes, setPendingNodes] = useState<RouteNode[] | null>(null);
  const [isParamsModalOpen, setIsParamsModalOpen] = useState(false);
  const [optimizationCriterion, setOptimizationCriterion] = useState<OptimizationCriterion>('cost');

  const [comparisonData, setComparisonData] = useState<ComparisonResult[] | null>(null);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
  const [variantResults, setVariantResults] = useState<ProcessedData[]>([]);
  const [savingsBaseline, setSavingsBaseline] = useState<ProcessedData | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const loadFleetFromServer = () => {
    getFleet().then(fleet => {
      setActiveFleetPool(fleet.vehicles);
      setDriverWaitingWage(fleet.driverWage);
    }).catch(() => {
      setActiveFleetPool(DEFAULT_FLEET_POOL);
    });
  };

  useEffect(() => {
    loadFleetFromServer();
  }, []);

  const handleDataLoaded = (nodes: RouteNode[]) => {
    setComparisonData(null);
    setSavingsBaseline(null);
    if (nodes.length < 2) {
      alert("Manifest must contain at least a Depot and one customer node.");
      return;
    }

    const coldStorageError = validateColdStorageFleet(nodes, activeFleetPool);
    if (coldStorageError) {
      alert(coldStorageError);
      return;
    }

    setPendingNodes(nodes);
    setIsParamsModalOpen(true);
  };

  const handleCompareAll = async () => {
    if (!pendingNodes) return;
    setIsParamsModalOpen(false);
    setIsComparing(true);
    setCurrentStep(0);
    setStepState('pending');

    const variants: { algorithm: 'savings' | 'nearest-neighbor' | 'sweep' | 'or-opt-sa' | 'solomon-i1'; applyTwoOpt: boolean }[] = [
      { algorithm: 'savings', applyTwoOpt: false },
      { algorithm: 'savings', applyTwoOpt: true },
      { algorithm: 'nearest-neighbor', applyTwoOpt: false },
      { algorithm: 'nearest-neighbor', applyTwoOpt: true },
      { algorithm: 'sweep', applyTwoOpt: false },
      { algorithm: 'sweep', applyTwoOpt: true },
      { algorithm: 'or-opt-sa', applyTwoOpt: false },
      { algorithm: 'solomon-i1', applyTwoOpt: false },
      { algorithm: 'solomon-i1', applyTwoOpt: true },
    ];

    const baseParams = {
      fleetPool: activeFleetPool,
      avgSpeed,
      driverWage: driverWaitingWage,
    };

    const labels: Record<string, string> = {
      savings: 'Clarke-Wright',
      'nearest-neighbor': 'Nearest Neighbor',
      sweep: 'Sweep',
      'or-opt-sa': 'Or-opt + SA',
      'solomon-i1': 'Solomon I1',
    };

    const results = await Promise.allSettled(
      variants.map(v => processData(pendingNodes!, { ...baseParams, ...v }))
    );

    const comparison: ComparisonResult[] = [];
    const variantData: ProcessedData[] = [];
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        const v = variants[idx];
        const d = r.value;
        comparison.push({
          algorithm: labels[v.algorithm],
          twoOpt: v.applyTwoOpt,
          milkRunDistance: d.milkRunDistance,
          milkRunCost: d.milkRunCost,
          milkRunCO2: d.milkRunCO2,
          milkRunWaitingHours: d.totalWaitingHours,
          totalTrucksUsed: d.totalTrucksUsed,
        });
        variantData.push(d);
      } else {
        console.warn(`Algorithm variant ${idx} failed:`, r.reason);
      }
    });

    // Auto-select best result for detail views, per the chosen optimization criterion,
    // preferring fewer time-window violations before cost/CO2/distance.
    const delayedCount = (d: ProcessedData) => d.legs.filter(l => l.status === 'Delayed').length;
    let bestData: ProcessedData | null = null;
    if (variantData.length > 0) {
      const metricKey = optimizationCriterion === 'co2' ? 'milkRunCO2' : optimizationCriterion === 'distance' ? 'milkRunDistance' : optimizationCriterion === 'waiting' ? 'milkRunWaitingHours' : 'milkRunCost';
      const bestIdx = comparison.reduce((bi, c, i) => {
        const biDelayed = delayedCount(variantData[bi]);
        const iDelayed = delayedCount(variantData[i]);
        if (iDelayed !== biDelayed) return iDelayed < biDelayed ? i : bi;
        return c[metricKey] < comparison[bi][metricKey] ? i : bi;
      }, 0);
      bestData = variantData[bestIdx];
      setProcessedData(bestData);
    }
    setVariantResults(variantData);

    const savingsIdx = comparison.findIndex(c => c.algorithm === 'Clarke-Wright' && !c.twoOpt);
    setSavingsBaseline(savingsIdx >= 0 ? variantData[savingsIdx] : null);

    setComparisonData(comparison);
    setCurrentTab('dashboard');
    setIsComparisonModalOpen(true);
    setIsComparing(false);

    if (bestData) {
      try {
        await saveActivePlan(optimizationCriterion, bestData);
      } catch (err) {
        console.error('Failed to save active plan:', err);
        alert('บันทึกแผนเส้นทางไปยังเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่ หรือแจ้งผู้ดูแลระบบ');
      }
    }
  };

  const selectVariant = async (idx: number) => {
    setProcessedData(variantResults[idx]);
    try {
      await saveActivePlan(optimizationCriterion, variantResults[idx]);
    } catch (err) {
      console.error('Failed to save active plan:', err);
      alert('บันทึกแผนเส้นทางไปยังเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่ หรือแจ้งผู้ดูแลระบบ');
    }
  };

  if (!isSignedIn) {
    return <LoginMockup onSignIn={() => setIsSignedIn(true)} />;
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-neutral-canvas overflow-hidden font-sans">
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <AppLogo className="w-28" />
        <button
          type="button"
          onClick={() => setIsMobileNavOpen(true)}
          aria-label="Open navigation menu"
          className="p-2 text-slate-600 hover:text-fleet-navy"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Sidebar Layout */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onDataLoaded={handleDataLoaded}
        isProcessing={isComparing}
        hasData={processedData !== null}
        hasComparison={comparisonData !== null}
        avgSpeed={avgSpeed}
        setAvgSpeed={setAvgSpeed}
        setIsFleetConfigOpen={setIsFleetConfigOpen}
        isMobileNavOpen={isMobileNavOpen}
        onCloseMobileNav={() => setIsMobileNavOpen(false)}
      />

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto">
        {isComparing ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-fleet-navy animate-spin mb-4" />
            <h2 className="text-xl font-bold text-slate-700">Running All Algorithms...</h2>
            <p className="text-slate-500 mt-2">Running 6 variants in parallel.</p>
          </div>
        ) : !processedData ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
            <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="w-12 h-12 text-slate-400" />
            </div>
            <h1 className="text-3xl font-bold text-fleet-navy mb-4">Welcome to RouteWay Intelligence</h1>
            <p className="text-lg text-slate-600 max-w-xl mx-auto">
              Please upload your vehicle manifest (.csv) using the sidebar to begin optimization. <br/><br/>
              The system requires no hardcoded data and relies entirely on your dynamic input for accurate routing, utilization metrics, and carbon tracking.
            </p>
          </div>
        ) : (
          <>
            {currentTab === 'dashboard' && (
              <Dashboard
                data={processedData}
                savingsBaseline={savingsBaseline}
                onViewAlgorithm={comparisonData ? () => setIsComparisonModalOpen(true) : undefined}
              />
            )}
            {currentTab === 'statistics' && <StatisticsCar data={processedData} savingsBaseline={savingsBaseline} />}
            {currentTab === 'driver' && (
              <DriverPortal
                data={processedData}
                currentStep={currentStep}
                setCurrentStep={setCurrentStep}
                stepState={stepState}
                setStepState={setStepState}
              />
            )}
            {currentTab === 'carbon' && <CarbonFootprint data={processedData} savingsBaseline={savingsBaseline} comparisonData={comparisonData} />}
            {currentTab === 'comparison' && comparisonData && (
              <AlgorithmComparison
                data={comparisonData}
                optimizationCriterion={optimizationCriterion}
                onSelectVariant={(idx) => {
                  selectVariant(idx);
                  setCurrentTab('dashboard');
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Algorithm Comparison Popup */}
      {isComparisonModalOpen && comparisonData && (
        <ComparisonPopup
          data={comparisonData}
          optimizationCriterion={optimizationCriterion}
          onClose={() => setIsComparisonModalOpen(false)}
          onSelectVariant={(idx) => {
            selectVariant(idx);
            setCurrentTab('dashboard');
            setIsComparisonModalOpen(false);
          }}
        />
      )}

      {/* Fleet Config Modal */}
      <FleetConfigModal
        isOpen={isFleetConfigOpen}
        onClose={() => setIsFleetConfigOpen(false)}
        onSaved={loadFleetFromServer}
      />

      {/* Params Setup Modal */}
      {isParamsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl animate-slide-up">
            <div className="bg-fleet-navy text-white p-4 sm:p-6 relative">
              <h2 className="text-xl font-bold">Set Routing Parameters</h2>
              <p className="text-blue-100 text-sm mt-1">Please set your Fleet Speed and Departure Time before calculating.</p>
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">Average Speed (km/h)</label>
                <input
                  type="number"
                  min="1"
                  value={avgSpeed}
                  onChange={(e) => setAvgSpeed(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-lg font-bold text-slate-800 focus:ring-2 focus:ring-fleet-navy focus:outline-none"
                  placeholder="e.g. 50"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">Optimize For</label>
                <div className="flex gap-2">
                  {([
                    { value: 'cost', label: 'Min Cost' },
                    { value: 'co2', label: 'Min CO2' },
                    { value: 'distance', label: 'Min Distance' },
                    { value: 'waiting', label: 'Min Waiting' },
                  ] as { value: OptimizationCriterion; label: string }[]).map(({ value, label }) => (
                    <label
                      key={value}
                      className={`flex-1 text-center cursor-pointer rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
                        optimizationCriterion === value
                          ? 'bg-fleet-navy text-white border-fleet-navy'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="optimizationCriterion"
                        value={value}
                        checked={optimizationCriterion === value}
                        onChange={() => setOptimizationCriterion(value)}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

            </div>

            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsParamsModalOpen(false);
                  setPendingNodes(null);
                }}
                className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCompareAll}
                disabled={!avgSpeed || avgSpeed <= 0}
                className="px-5 py-2.5 rounded-lg text-sm font-bold bg-signal-green text-white hover:bg-signal-green-hover transition-colors shadow-sm shadow-signal-green/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                คำนวณเส้นทาง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
