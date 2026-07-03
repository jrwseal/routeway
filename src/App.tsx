import React, { useState } from 'react';
import { RouteNode, ProcessedData } from './types';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CarbonFootprint from './components/CarbonFootprint';
import DriverPortal from './components/DriverPortal';
import StatisticsCar from './components/StatisticsCar';
import { processData, DEFAULT_FLEET_POOL } from './lib/geo';
import { AlertCircle, Loader2 } from 'lucide-react';
import FleetConfigModal from './components/FleetConfigModal';

export default function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepState, setStepState] = useState<'pending' | 'in_transit'>('pending');
  const [isProcessing, setIsProcessing] = useState(false);

  // Configuration State
  const [activeFleetPool, setActiveFleetPool] = useState([...DEFAULT_FLEET_POOL]);
  const [isFleetConfigOpen, setIsFleetConfigOpen] = useState(false);
  const [avgSpeed, setAvgSpeed] = useState(50);
  const [driverWaitingWage, setDriverWaitingWage] = useState(60);
  const [fuelPrice4W, setFuelPrice4W] = useState(35);
  const [fuelPrice6W, setFuelPrice6W] = useState(35);
  const [fuelPrice10W, setFuelPrice10W] = useState(35);

  const [pendingNodes, setPendingNodes] = useState<RouteNode[] | null>(null);
  const [isParamsModalOpen, setIsParamsModalOpen] = useState(false);
  const [departureTimeStr, setDepartureTimeStr] = useState("08:00");

  const handleDataLoaded = (nodes: RouteNode[]) => {
    if (nodes.length < 2) {
      alert("Manifest must contain at least a Depot and one customer node.");
      return;
    }
    
    setPendingNodes(nodes);
    setIsParamsModalOpen(true);
  };

  const calculateRoutes = async () => {
    if (!pendingNodes) return;
    
    setIsParamsModalOpen(false);
    setIsProcessing(true);
    setCurrentStep(0);
    setStepState('pending');
    try {
      const depot = pendingNodes[0];
      const todayStr = new Date().toISOString().split('T')[0];
      // Default to today at 08:00 if not provided
      let startDateTime = new Date(`${todayStr} 08:00`);
      
      if (departureTimeStr) {
        const parts = departureTimeStr.split(':');
        if (parts.length >= 2) {
          startDateTime = new Date(`${todayStr} ${parts[0]}:${parts[1]}`);
        }
      }

      const data = await processData(pendingNodes, {
        fleetPool: activeFleetPool,
        avgSpeed,
        startTime: startDateTime,
        driverWage: driverWaitingWage,
        fuelPrice4W,
        fuelPrice6W,
        fuelPrice10W
      });
      setProcessedData(data);
      setCurrentTab('dashboard'); // Auto-switch to dashboard on load
    } catch (error) {
      console.error(error);
      alert("Error processing route data. Please check connection and console.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#F8FAFC] overflow-hidden font-sans">
      {/* Sidebar Layout */}
      <Sidebar 
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onDataLoaded={handleDataLoaded}
        isProcessing={isProcessing}
        hasData={processedData !== null}
        avgSpeed={avgSpeed}
        setAvgSpeed={setAvgSpeed}
        setIsFleetConfigOpen={setIsFleetConfigOpen}
      />

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto">
        {isProcessing ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-[#1E3A8A] animate-spin mb-4" />
            <h2 className="text-xl font-bold text-slate-700">Calculating Optimizer Engine...</h2>
            <p className="text-slate-500 mt-2">Fetching live OSRM routes and modeling emissions.</p>
          </div>
        ) : !processedData ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
            <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="w-12 h-12 text-slate-400" />
            </div>
            <h1 className="text-3xl font-bold text-[#1E3A8A] mb-4">Welcome to RouteWay Intelligence</h1>
            <p className="text-lg text-slate-600 max-w-xl mx-auto">
              Please upload your vehicle manifest (.csv) using the sidebar to begin optimization. <br/><br/>
              The system requires no hardcoded data and relies entirely on your dynamic input for accurate routing, utilization metrics, and carbon tracking.
            </p>
          </div>
        ) : (
          <>
            {currentTab === 'dashboard' && <Dashboard data={processedData} />}
            {currentTab === 'statistics' && <StatisticsCar data={processedData} />}
            {currentTab === 'driver' && (
              <DriverPortal 
                data={processedData} 
                currentStep={currentStep} 
                setCurrentStep={setCurrentStep}
                stepState={stepState}
                setStepState={setStepState}
              />
            )}
            {currentTab === 'carbon' && <CarbonFootprint data={processedData} />}
          </>
        )}
      </main>

      {/* Fleet Config Modal */}
      <FleetConfigModal 
        isOpen={isFleetConfigOpen}
        onClose={() => setIsFleetConfigOpen(false)}
        activeFleetPool={activeFleetPool}
        initialDriverWage={driverWaitingWage}
        initialFuelPrice4W={fuelPrice4W}
        initialFuelPrice6W={fuelPrice6W}
        initialFuelPrice10W={fuelPrice10W}
        onSave={(newPool, newWage, fuel4W, fuel6W, fuel10W) => {
          setActiveFleetPool(newPool);
          setDriverWaitingWage(newWage);
          setFuelPrice4W(fuel4W);
          setFuelPrice6W(fuel6W);
          setFuelPrice10W(fuel10W);
        }}
      />

      {/* Params Setup Modal */}
      {isParamsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-slide-up">
            <div className="bg-[#1E3A8A] text-white p-6 relative">
              <h2 className="text-xl font-bold">Set Routing Parameters</h2>
              <p className="text-blue-100 text-sm mt-1">Please set your Fleet Speed and Departure Time before calculating.</p>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">Average Speed (km/h)</label>
                <input 
                  type="number" 
                  min="1"
                  value={avgSpeed} 
                  onChange={(e) => setAvgSpeed(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-lg font-bold text-slate-800 focus:ring-2 focus:ring-[#1E3A8A] focus:outline-none"
                  placeholder="e.g. 50"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">Departure Time (HH:MM)</label>
                <input 
                  type="time" 
                  value={departureTimeStr} 
                  onChange={(e) => setDepartureTimeStr(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-lg font-bold text-slate-800 focus:ring-2 focus:ring-[#1E3A8A] focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
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
                onClick={calculateRoutes}
                disabled={!avgSpeed || avgSpeed <= 0 || !departureTimeStr}
                className="px-5 py-2.5 rounded-lg text-sm font-bold bg-[#10B981] text-white hover:bg-[#059669] transition-colors shadow-sm shadow-[#10B981]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                Calculate Routes (คำนวณเส้นทาง)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
