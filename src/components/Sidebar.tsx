import React from 'react';
import { RouteNode, ProcessedData } from '../types';
import { Truck, Navigation, Leaf, UploadCloud, Info, BarChart } from 'lucide-react';
import Papa from 'papaparse';
import { parse } from 'date-fns';

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
}

export default function Sidebar({
  currentTab, setCurrentTab, onDataLoaded, isProcessing, hasData, hasComparison,
  avgSpeed, setAvgSpeed, setIsFleetConfigOpen
}: SidebarProps) {

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (!buffer) return;

      // Try UTF-8 first (handles utf-8-sig automatically by stripping BOM)
      let text = new TextDecoder('utf-8').decode(buffer);
      
      // If decoding UTF-8 reveals replacement characters, fallback to Thai encoding (cp874 / windows-874)
      if (text.includes('\uFFFD')) {
        text = new TextDecoder('windows-874').decode(buffer);
      }

      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const parsedNodes: RouteNode[] = results.data.map((row: any, index: number) => {
            const todayStr = new Date().toISOString().split('T')[0];
            const parseTime = (timeStr: string) => {
              if (!timeStr || !timeStr.trim()) return null;
              const parts = timeStr.trim().split(':');
              if (parts.length >= 2) {
                const h = parts[0].padStart(2, '0');
                const m = parts[1].padStart(2, '0');
                return parse(`${todayStr} ${h}:${m}`, 'yyyy-MM-dd HH:mm', new Date());
              }
              return null;
            };

            return {
              id: index,
              location: row['Location'] || `Node ${index}`,
              lat: parseFloat(row['Lat']),
              lon: parseFloat(row['Lon']),
              demandVolume: parseFloat(row['Demand_Volume']) || 0,
              weight: parseFloat(row['Weight']) || 0,
              readyTime: parseTime(row['Ready_Time']),
              dueTime: parseTime(row['Due_Time']),
              originalReadyString: row['Ready_Time'],
              originalDueString: row['Due_Time'],
            }
          });

          // Validate
          if (parsedNodes.some(n => isNaN(n.lat) || isNaN(n.lon))) {
            alert('Invalid CSV: Missing Lat or Lon columns.');
            return;
          }

          onDataLoaded(parsedNodes);
        } catch (error) {
          alert('Error parsing CSV. Please ensure format is correct.');
          console.error(error);
        }
      }
    });
  };
  reader.readAsArrayBuffer(file);
};

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard & Savings', icon: <Truck className="w-4 h-4 mr-2" /> },
    { id: 'driver', label: 'Interactive Driver Portal', icon: <Navigation className="w-4 h-4 mr-2" /> },
    { id: 'carbon', label: 'Carbon Footprint', icon: <Leaf className="w-4 h-4 mr-2" /> },
    { id: 'statistics', label: 'Statistics car', icon: <BarChart className="w-4 h-4 mr-2" /> },
    { id: 'comparison', label: 'Algorithm Comparison', icon: <BarChart className="w-4 h-4 mr-2" /> },
  ];

  return (
    <div className="w-80 h-full bg-[#F8FAFC] border-r border-slate-200 flex flex-col pt-6 overflow-y-auto">
      <div className="px-6 mb-8">
        <h1 className="text-2xl font-bold text-[#1E3A8A]">RouteWay</h1>
        <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mt-1">Logistics Intelligence</p>
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

        <label className="text-sm font-semibold text-[#1E3A8A]">Vehicle Manifest (CSV)</label>
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
          <span>Expected columns: Location, Lat, Lon, Demand_Volume, Ready_Time, Due_Time</span>
        </div>
      </div>

      <nav className="flex-1 px-4 flex flex-col gap-1">
        {menuItems.map(item => (
          <button
            key={item.id}
            disabled={item.id === 'comparison' ? !hasComparison : !hasData}
            onClick={() => setCurrentTab(item.id)}
            className={`flex items-center px-4 py-3 rounded-md text-sm font-medium transition-colors ${
              currentTab === item.id 
                ? 'bg-[#1E3A8A] text-white' 
                : 'text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
