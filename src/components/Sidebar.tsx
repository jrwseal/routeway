import React from 'react';
import { RouteNode, ProcessedData } from '../types';
import { Truck, Navigation, Leaf, UploadCloud, Info, BarChart, X, Snowflake } from 'lucide-react';
import { readManifestFile } from '../lib/csvParser';
import AppLogo from './AppLogo';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onDataLoaded: (nodes: RouteNode[]) => void;
  isProcessing: boolean;
  hasData: boolean;
  hasComparison: boolean;
  avgSpeed: number;
  setAvgSpeed: (val: number) => void;
  setIsFleetConfigOpen: (isOpen: boolean) => void;
  isMobileNavOpen: boolean;
  onCloseMobileNav: () => void;
}

export default function Sidebar({
  currentTab, setCurrentTab, onDataLoaded, isProcessing, hasData, hasComparison,
  avgSpeed, setAvgSpeed, setIsFleetConfigOpen, isMobileNavOpen, onCloseMobileNav
}: SidebarProps) {

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    readManifestFile(file)
      .then(onDataLoaded)
      .catch((error: Error) => {
        alert(error.message.startsWith('Invalid CSV') ? error.message : 'Error parsing CSV. Please ensure format is correct.');
        console.error(error);
      });
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard & Savings', icon: <Truck className="w-4 h-4 mr-2" /> },
    { id: 'care', label: 'RouteWay Care', icon: <Snowflake className="w-4 h-4 mr-2" /> },
    { id: 'driver', label: 'Interactive Driver Portal', icon: <Navigation className="w-4 h-4 mr-2" /> },
    { id: 'carbon', label: 'Carbon Footprint', icon: <Leaf className="w-4 h-4 mr-2" /> },
    { id: 'statistics', label: 'Statistics car', icon: <BarChart className="w-4 h-4 mr-2" /> },
    { id: 'comparison', label: 'Algorithm Comparison', icon: <BarChart className="w-4 h-4 mr-2" /> },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileNavOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
          onClick={onCloseMobileNav}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-40 w-80 h-full bg-neutral-canvas border-r border-slate-200 flex flex-col pt-6 overflow-y-auto transform transition-transform duration-300 ease-out
          lg:static lg:translate-x-0
          ${isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="px-6 mb-8 flex items-start justify-between">
          <AppLogo className="w-40 rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-slate-200" />
          <button
            type="button"
            onClick={onCloseMobileNav}
            aria-label="Close navigation menu"
            className="lg:hidden p-2 -mr-2 text-slate-500 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

      <div className="px-6 mb-8 flex flex-col gap-4">
        <button 
          onClick={() => setIsFleetConfigOpen(true)}
          className="w-full flex items-center justify-center bg-white border border-slate-300 text-slate-700 py-2 px-4 rounded-md text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors"
        >
          ⚙️ ตั้งค่ากองรถ (Fleet Config)
        </button>
        <p className="text-[10px] text-slate-500 leading-tight">
          *หมายเหตุ: หากไม่ได้ทำการตั้งค่ากองรถ ระบบจะคำนวณโดยอิงตามค่ามาตรฐาน (Standard Pool) ของระบบโดยอัตโนมัติ
        </p>

        <label className="text-sm font-semibold text-fleet-navy">Vehicle Manifest (CSV)</label>
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
          <UploadCloud className="w-6 h-6 mx-auto mb-2 text-slate-400" />
          <span className="text-xs text-slate-500">Upload Manifest (.csv)</span>
          <input 
            type="file" 
            accept=".csv" 
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={handleFileUpload}
            disabled={isProcessing}
          />
        </div>
        <div className="text-xs text-slate-500 flex items-start mt-1">
          <Info className="w-3 h-3 mr-1 mt-0.5 inline-block shrink-0" />
          <span>Expected columns: Location, Lat, Lon, Demand_Volume, Ready_Time, Due_Time (optional: ต้องการรถห้องเย็น, Parcel_Id, Parcel_Name, Parcel_Tier, Max_Exposure_Minutes, Temp_Min_C, Temp_Max_C)</span>
        </div>
      </div>

      <nav className="flex-1 px-4 flex flex-col gap-1">
        {menuItems.map(item => (
          <button
            key={item.id}
            disabled={item.id === 'comparison' ? !hasComparison : !hasData}
            onClick={() => { setCurrentTab(item.id); onCloseMobileNav(); }}
            className={`flex items-center px-4 py-3 rounded-md text-sm font-medium transition-colors ${
              currentTab === item.id 
                ? 'bg-fleet-navy text-white' 
                : 'text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      </div>
    </>
  );
}
