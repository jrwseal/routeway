import React, { useState, useEffect } from 'react';
import { Vehicle } from '../types';
import { getFleet, saveFleet, getDrivers, DriverAccount } from '../lib/api';
import { Truck, Plus, Trash2, Save, X } from 'lucide-react';
import { VEHICLE_TYPE_DEFS, getAvailableVehicleTypes, canDisableColdStorage } from '../lib/fleetTypes';

interface FleetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function FleetConfigModal({ isOpen, onClose, onSaved }: FleetConfigModalProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [driverWage, setDriverWage] = useState(60);
  const [enableColdStorage, setEnableColdStorage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    Promise.all([getFleet(), getDrivers()]).then(([fleet, driverList]) => {
      setVehicles(fleet.vehicles);
      setDriverWage(fleet.driverWage);
      setEnableColdStorage(fleet.enableColdStorage);
      setDrivers(driverList);
      setIsLoading(false);
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const updateVehicle = (id: string, field: keyof Vehicle, value: number | string | null) => {
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const addVehicle = (type: string) => {
    const def = VEHICLE_TYPE_DEFS.find(d => d.type === type)!;
    const count = vehicles.filter(v => v.type === type).length;
    setVehicles(prev => [...prev, {
      id: `${type}-${Date.now()}`,
      type,
      name: `${def.label} - คันที่ ${count + 1}`,
      capacityCBM: def.defaultCapacityCBM,
      fuelConsumption: def.defaultFuelConsumption,
      fixedCost: def.defaultFixedCost,
      color: def.color,
      fuelPrice: 35,
      departureTime: '08:00',
      driverUserId: null,
    }]);
  };

  const updateVehicleType = (id: string, type: string) => {
    const def = VEHICLE_TYPE_DEFS.find(d => d.type === type)!;
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, type, color: def.color } : v));
  };

  const removeVehicle = (id: string) => {
    setVehicles(prev => prev.filter(v => v.id !== id));
  };

  const handleSave = async () => {
    await saveFleet({ vehicles, driverWage, enableColdStorage });
    onSaved();
    onClose();
  };

  const sortedVehicles = [...vehicles].sort((a, b) => {
    const typeOrder = VEHICLE_TYPE_DEFS.findIndex(d => d.type === a.type) - VEHICLE_TYPE_DEFS.findIndex(d => d.type === b.type);
    return typeOrder !== 0 ? typeOrder : a.name.localeCompare(b.name);
  });

  const availableTypeDefs = getAvailableVehicleTypes(enableColdStorage);
  const toggleLocked = enableColdStorage && !canDisableColdStorage(vehicles);

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

              <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer" title={toggleLocked ? 'ลบรถห้องเย็นออกจากกองรถก่อนจึงจะปิดได้' : undefined}>
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={enableColdStorage}
                    disabled={toggleLocked}
                    onChange={(e) => setEnableColdStorage(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-fleet-navy peer-disabled:opacity-50 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
                </label>
                <span className="font-bold text-slate-700 text-lg">🧊 เปิดใช้งานรถห้องเย็น</span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <div className="flex items-center">
                    <Truck className="w-5 h-5 mr-2 text-fleet-navy" />
                    <h3 className="font-bold text-lg text-slate-800">รายการยานพาหนะ</h3>
                  </div>
                  <div className="flex gap-2">
                    {availableTypeDefs.map(def => (
                      <button
                        key={def.type}
                        onClick={() => addVehicle(def.type)}
                        className="flex items-center text-xs font-bold text-fleet-navy hover:underline"
                      >
                        <Plus className="w-3 h-3 mr-1" /> {def.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 uppercase">
                        <th className="pb-2 pr-2">ประเภท</th>
                        <th className="pb-2 pr-2">ชื่อรถ</th>
                        <th className="pb-2 pr-2">Capacity (CBM)</th>
                        <th className="pb-2 pr-2">Fuel (L/km)</th>
                        <th className="pb-2 pr-2">ราคาน้ำมัน (บาท/ลิตร)</th>
                        <th className="pb-2 pr-2">Fixed Cost</th>
                        <th className="pb-2 pr-2">เวลาออกเดินทาง</th>
                        <th className="pb-2 pr-2">คนขับ</th>
                        <th className="pb-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedVehicles.map(v => (
                        <tr key={v.id} className="border-t border-slate-100">
                          <td className="py-2 pr-2">
                            <select
                              value={v.type}
                              onChange={(e) => updateVehicleType(v.id, e.target.value)}
                              className="border border-slate-300 rounded px-2 py-1 bg-white"
                            >
                              {availableTypeDefs.map(def => (
                                <option key={def.type} value={def.type}>{def.label}</option>
                              ))}
                            </select>
                          </td>
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
                            <input type="number" step="0.01" min="0" value={v.fuelPrice} onChange={(e) => updateVehicle(v.id, 'fuelPrice', Number(e.target.value))} className="w-20 border border-slate-300 rounded px-2 py-1" />
                          </td>
                          <td className="py-2 pr-2">
                            <input type="number" step="1" min="0" value={v.fixedCost} onChange={(e) => updateVehicle(v.id, 'fixedCost', Number(e.target.value))} className="w-24 border border-slate-300 rounded px-2 py-1" />
                          </td>
                          <td className="py-2 pr-2">
                            <input type="time" value={v.departureTime} onChange={(e) => updateVehicle(v.id, 'departureTime', e.target.value)} className="border border-slate-300 rounded px-2 py-1" />
                          </td>
                          <td className="py-2 pr-2">
                            <select
                              value={v.driverUserId ?? ''}
                              onChange={(e) => updateVehicle(v.id, 'driverUserId', e.target.value || null)}
                              className="border border-slate-300 rounded px-2 py-1 bg-white"
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
