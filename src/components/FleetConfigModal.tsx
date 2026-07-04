import React, { useState, useEffect } from 'react';
import { Vehicle } from '../types';
import { DEFAULT_FLEET_POOL } from '../lib/geo';
import { Truck, RefreshCw, Save, X } from 'lucide-react';

interface FleetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeFleetPool: Vehicle[];
  initialDriverWage: number;
  initialFuelPrice4W: number;
  initialFuelPrice6W: number;
  initialFuelPrice10W: number;
  onSave: (newFleetPool: Vehicle[], driverWage: number, fuel4W: number, fuel6W: number, fuel10W: number) => void;
}

export default function FleetConfigModal({ isOpen, onClose, activeFleetPool, initialDriverWage, initialFuelPrice4W, initialFuelPrice6W, initialFuelPrice10W, onSave }: FleetConfigModalProps) {
  const [localFleet, setLocalFleet] = useState<Vehicle[]>([]);
  const [localDriverWage, setLocalDriverWage] = useState(initialDriverWage);
  const [localFuelPrice4W, setLocalFuelPrice4W] = useState(initialFuelPrice4W);
  const [localFuelPrice6W, setLocalFuelPrice6W] = useState(initialFuelPrice6W);
  const [localFuelPrice10W, setLocalFuelPrice10W] = useState(initialFuelPrice10W);

  useEffect(() => {
    if (isOpen) {
      setLocalFleet(JSON.parse(JSON.stringify(activeFleetPool)));
      setLocalDriverWage(initialDriverWage);
      setLocalFuelPrice4W(initialFuelPrice4W);
      setLocalFuelPrice6W(initialFuelPrice6W);
      setLocalFuelPrice10W(initialFuelPrice10W);
    }
  }, [isOpen, activeFleetPool, initialDriverWage, initialFuelPrice4W, initialFuelPrice6W, initialFuelPrice10W]);

  if (!isOpen) return null;

  const handleStandardConfig = () => {
    setLocalFleet(JSON.parse(JSON.stringify(DEFAULT_FLEET_POOL)));
    setLocalDriverWage(60);
    setLocalFuelPrice4W(35);
    setLocalFuelPrice6W(35);
    setLocalFuelPrice10W(35);
  };

  const handleSave = () => {
    onSave(localFleet, localDriverWage, localFuelPrice4W, localFuelPrice6W, localFuelPrice10W);
    onClose();
  };

  const updateVehicle = (id: string, field: keyof Vehicle, value: number) => {
    setLocalFleet(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const getVehiclesByType = (type: string) => localFleet.filter(v => v.type === type);

  const updateVehicleCount = (type: string, newCount: number) => {
    if (newCount < 0) return;
    const currentVehicles = getVehiclesByType(type);
    if (newCount === currentVehicles.length) return;

    if (newCount > currentVehicles.length) {
      // Add more
      const template = currentVehicles.length > 0 
        ? currentVehicles[0] 
        : DEFAULT_FLEET_POOL.find(v => v.type === type)!;
        
      const addCount = newCount - currentVehicles.length;
      const newVehicles: Vehicle[] = [];
      for (let i = 0; i < addCount; i++) {
        const nextIdx = currentVehicles.length + i + 1;
        const prefix = type === '4-wheel' ? '4w' : type === '6-wheel' ? '6w' : '10w';
        const titleName = type === '4-wheel' ? 'รถบรรทุก 4 ล้อใหญ่' : type === '6-wheel' ? 'รถบรรทุก 6 ล้อ' : 'รถบรรทุก 10 ล้อ';
        newVehicles.push({
          ...template,
          id: `${prefix}-${nextIdx}-${Date.now()}`,
          name: `${titleName} - คันที่ ${nextIdx}`
        });
      }
      setLocalFleet(prev => [...prev, ...newVehicles]);
    } else {
      // Remove from end
      const keepIds = currentVehicles.slice(0, newCount).map(v => v.id);
      setLocalFleet(prev => prev.filter(v => v.type !== type || keepIds.includes(v.id)));
    }
  };

  const renderVehicleSection = (title: string, type: string, color: string, fuelPrice: number, setFuelPrice: (v: number) => void) => {
    const vehicles = getVehiclesByType(type);
    
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center">
            <Truck className="w-5 h-5 mr-2" style={{ color }} />
            <h3 className="font-bold text-lg text-slate-800">{title}</h3>
          </div>
          <div className="w-20">
             <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">จำนวนคัน</label>
             <input 
               type="number"
               min="0"
               value={vehicles.length}
               onChange={(e) => updateVehicleCount(type, parseInt(e.target.value) || 0)}
               className="w-full border border-slate-300 rounded px-2 py-1 text-sm bg-white font-bold text-center text-fleet-navy"
             />
          </div>
        </div>

        <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-700">⛽ ค่าน้ำมัน:</span>
          <div className="flex items-center">
            <input 
              type="number"
              min="0"
              step="0.01"
              value={fuelPrice}
              onChange={(e) => setFuelPrice(Number(e.target.value))}
              className="w-16 border border-slate-300 rounded px-2 py-1 text-sm bg-white font-bold text-center text-fleet-navy focus:ring-1 focus:ring-fleet-navy focus:outline-none"
            />
            <span className="text-sm font-bold text-slate-600 ml-2">บาท / ลิตร</span>
          </div>
        </div>
        
        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
          {vehicles.map((v, idx) => (
            <div key={v.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div className="font-medium text-sm text-fleet-navy mb-2">{v.name}</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Capacity (CBM)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={v.capacityCBM}
                    onChange={(e) => updateVehicle(v.id, 'capacityCBM', Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Fuel (L/km)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={v.fuelConsumption}
                    onChange={(e) => updateVehicle(v.id, 'fuelConsumption', Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Fixed Cost (บาท/เที่ยว)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={v.fixedCost}
                    onChange={(e) => updateVehicle(v.id, 'fixedCost', Number(e.target.value))}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-50 rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-fleet-navy flex items-center">
            <span className="text-2xl mr-2">⚙️</span> ตั้งค่ากองรถ (Dynamic Fleet Configuration)
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Top Settings */}
          <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center">
            <span className="font-bold text-slate-700 text-lg flex items-center mr-3">
              ⏱️ ค่าแรงคนขับ:
            </span>
            <div className="flex items-center">
              <input
                type="number"
                min="0"
                value={localDriverWage}
                onChange={(e) => setLocalDriverWage(Number(e.target.value))}
                className="w-24 border border-slate-300 rounded-md px-3 py-1.5 text-lg font-bold text-center text-fleet-navy focus:ring-2 focus:ring-fleet-navy focus:outline-none"
              />
              <span className="font-bold text-slate-700 text-lg ml-3">
                บาท / ชั่วโมง
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {renderVehicleSection('รถบรรทุก 4 ล้อใหญ่', '4-wheel', '#10B981', localFuelPrice4W, setLocalFuelPrice4W)}
            {renderVehicleSection('รถบรรทุก 6 ล้อ', '6-wheel', '#3B82F6', localFuelPrice6W, setLocalFuelPrice6W)}
            {renderVehicleSection('รถบรรทุก 10 ล้อ', '10-wheel', '#F97316', localFuelPrice10W, setLocalFuelPrice10W)}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white px-6 py-4 border-t border-slate-200 flex justify-end items-center gap-4">
          <button 
            onClick={handleStandardConfig}
            className="flex items-center px-4 py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-md font-bold text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            🔄 ใช้ค่ามาตรฐาน (Standard)
          </button>
          
          <button 
            onClick={handleSave}
            className="flex items-center px-6 py-2 bg-fleet-navy text-white hover:bg-blue-800 rounded-md font-bold text-sm transition-colors shadow-md"
          >
            <Save className="w-4 h-4 mr-2" />
            💾 บันทึกและใช้งานกองรถนี้
          </button>
        </div>
      </div>
    </div>
  );
}
