import React, { useState, useEffect } from 'react';
import { Vehicle } from '../types';
import { DriverAccount, getFleet, saveFleet, listDrivers } from '../lib/api';
import { Truck, Plus, Trash2, Save, X } from 'lucide-react';

interface FleetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  '4-wheel': 'รถบรรทุก 4 ล้อใหญ่',
  '6-wheel': 'รถบรรทุก 6 ล้อ',
  '10-wheel': 'รถบรรทุก 10 ล้อ',
};
const TYPE_COLORS: Record<string, string> = {
  '4-wheel': '#10B981',
  '6-wheel': '#3B82F6',
  '10-wheel': '#F97316',
};

export default function FleetConfigModal({ isOpen, onClose, onSaved }: FleetConfigModalProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);
  const [driverWage, setDriverWage] = useState(60);
  const [fuelPrice4W, setFuelPrice4W] = useState(35);
  const [fuelPrice6W, setFuelPrice6W] = useState(35);
  const [fuelPrice10W, setFuelPrice10W] = useState(35);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    Promise.all([getFleet(), listDrivers()]).then(([fleet, driverList]) => {
      setVehicles(fleet.vehicles);
      setDriverWage(fleet.driverWage);
      setFuelPrice4W(fleet.fuelPrice4W);
      setFuelPrice6W(fleet.fuelPrice6W);
      setFuelPrice10W(fleet.fuelPrice10W);
      setDrivers(driverList);
      setIsLoading(false);
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const updateVehicle = (id: string, field: keyof Vehicle, value: number | string | null) => {
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const addVehicle = (type: string) => {
    const count = vehicles.filter(v => v.type === type).length;
    setVehicles(prev => [...prev, {
      id: `${type}-${Date.now()}`,
      type,
      name: `${TYPE_LABELS[type]} - คันที่ ${count + 1}`,
      capacityCBM: type === '4-wheel' ? 12 : type === '6-wheel' ? 32 : 48,
      fuelConsumption: type === '4-wheel' ? 0.12 : type === '6-wheel' ? 0.2 : 0.28,
      fixedCost: type === '4-wheel' ? 300 : type === '6-wheel' ? 450 : 600,
      color: TYPE_COLORS[type],
      driverUserId: null,
    }]);
  };

  const removeVehicle = (id: string) => {
    setVehicles(prev => prev.filter(v => v.id !== id));
  };

  const handleSave = async () => {
    await saveFleet({ vehicles, driverWage, fuelPrice4W, fuelPrice6W, fuelPrice10W });
    onSaved();
    onClose();
  };

  const fuelPriceFor = (type: string) => type === '4-wheel' ? fuelPrice4W : type === '6-wheel' ? fuelPrice6W : fuelPrice10W;
  const setFuelPriceFor = (type: string) => type === '4-wheel' ? setFuelPrice4W : type === '6-wheel' ? setFuelPrice6W : setFuelPrice10W;

  const renderVehicleSection = (type: string) => {
    const rows = vehicles.filter(v => v.type === type);
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center">
            <Truck className="w-5 h-5 mr-2" style={{ color: TYPE_COLORS[type] }} />
            <h3 className="font-bold text-lg text-slate-800">{TYPE_LABELS[type]}</h3>
          </div>
          <div className="flex items-center">
            <span className="text-sm font-bold text-slate-700 mr-2">⛽</span>
            <input
              type="number" min="0" step="0.01"
              value={fuelPriceFor(type)}
              onChange={(e) => setFuelPriceFor(type)(Number(e.target.value))}
              className="w-16 border border-slate-300 rounded px-2 py-1 text-sm text-center font-bold"
            />
            <span className="text-xs text-slate-600 ml-1">บาท/ลิตร</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase">
                <th className="pb-2 pr-2">ชื่อรถ</th>
                <th className="pb-2 pr-2">Capacity (CBM)</th>
                <th className="pb-2 pr-2">Fuel (L/km)</th>
                <th className="pb-2 pr-2">Fixed Cost</th>
                <th className="pb-2 pr-2">Driver account</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(v => (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="py-2 pr-2">
                    <input value={v.name} onChange={(e) => updateVehicle(v.id, 'name', e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" step="0.1" value={v.capacityCBM} onChange={(e) => updateVehicle(v.id, 'capacityCBM', Number(e.target.value))} className="w-20 border border-slate-300 rounded px-2 py-1" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" step="0.01" value={v.fuelConsumption} onChange={(e) => updateVehicle(v.id, 'fuelConsumption', Number(e.target.value))} className="w-20 border border-slate-300 rounded px-2 py-1" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" step="1" min="0" value={v.fixedCost} onChange={(e) => updateVehicle(v.id, 'fixedCost', Number(e.target.value))} className="w-24 border border-slate-300 rounded px-2 py-1" />
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={v.driverUserId ?? ''}
                      onChange={(e) => updateVehicle(v.id, 'driverUserId', e.target.value ? Number(e.target.value) : null)}
                      className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="">ยังไม่ระบุ</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.displayName}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeVehicle(v.id)} className="text-slate-400 hover:text-alert-red">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={() => addVehicle(type)}
          className="mt-3 flex items-center text-sm font-bold text-fleet-navy hover:underline"
        >
          <Plus className="w-4 h-4 mr-1" /> เพิ่มรถ
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-50 rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
        <div className="bg-white px-4 sm:px-6 py-4 border-b border-slate-200 flex justify-between items-center gap-2">
          <h2 className="text-lg sm:text-2xl font-bold text-fleet-navy flex items-center">
            <span className="text-xl sm:text-2xl mr-2">⚙️</span> ตั้งค่ากองรถ (Fleet Configuration)
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 flex-shrink-0">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="text-center text-slate-400 py-12">กำลังโหลด...</div>
          ) : (
            <>
              <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-700 text-lg flex items-center mr-3">⏱️ ค่าแรงคนขับ:</span>
                <input
                  type="number" min="0"
                  value={driverWage}
                  onChange={(e) => setDriverWage(Number(e.target.value))}
                  className="w-24 border border-slate-300 rounded-md px-3 py-1.5 text-lg font-bold text-center text-fleet-navy"
                />
                <span className="font-bold text-slate-700 text-lg ml-3">บาท / ชั่วโมง</span>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {renderVehicleSection('4-wheel')}
                {renderVehicleSection('6-wheel')}
                {renderVehicleSection('10-wheel')}
              </div>
            </>
          )}
        </div>

        <div className="bg-white px-4 sm:px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={handleSave} disabled={isLoading} className="flex items-center justify-center px-6 py-2 bg-fleet-navy text-white hover:bg-blue-800 rounded-md font-bold text-sm transition-colors shadow-md disabled:opacity-50">
            <Save className="w-4 h-4 mr-2" /> บันทึกและใช้งานกองรถนี้
          </button>
        </div>
      </div>
    </div>
  );
}
