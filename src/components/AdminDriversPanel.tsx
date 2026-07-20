import React, { useEffect, useState } from 'react';
import { DriverAccount, getDrivers, createDriver, updateDriver, deleteDriver } from '../lib/api';
import { Users, Plus, Trash2, X, KeyRound } from 'lucide-react';

interface AdminDriversPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminDriversPanel({ isOpen, onClose }: AdminDriversPanelProps) {
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setIsLoading(true);
    getDrivers().then(setDrivers).finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    reload();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createDriver(username, password, displayName);
      setUsername('');
      setPassword('');
      setDisplayName('');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างบัญชีคนขับไม่สำเร็จ');
    }
  };

  const handleResetPassword = async (id: string) => {
    const newPassword = window.prompt('รหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร)');
    if (!newPassword) return;
    await updateDriver(id, { password: newPassword });
    reload();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ลบบัญชีคนขับนี้?')) return;
    await deleteDriver(id);
    reload();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-50 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
        <div className="bg-white px-4 sm:px-6 py-4 border-b border-slate-200 flex justify-between items-center gap-2">
          <h2 className="text-lg sm:text-2xl font-bold text-fleet-navy flex items-center">
            <Users className="w-6 h-6 mr-2" /> จัดการคนขับ
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 flex-shrink-0">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          <form onSubmit={handleCreate} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-800">เพิ่มคนขับใหม่</h3>
            {error && <div className="text-sm font-semibold text-alert-red">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input required value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="border border-slate-300 rounded px-3 py-2" />
              <input required value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" className="border border-slate-300 rounded px-3 py-2" />
              <input required value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="ชื่อที่แสดง" className="border border-slate-300 rounded px-3 py-2" />
            </div>
            <button type="submit" className="flex items-center gap-1 bg-fleet-navy text-white font-bold px-4 py-2 rounded-md text-sm">
              <Plus className="w-4 h-4" /> เพิ่มคนขับ
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-3">รายชื่อคนขับ</h3>
            {isLoading ? (
              <div className="text-center text-slate-400 py-6">กำลังโหลด...</div>
            ) : drivers.length === 0 ? (
              <div className="text-center text-slate-400 py-6">ยังไม่มีบัญชีคนขับ</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase">
                    <th className="pb-2">Username</th>
                    <th className="pb-2">ชื่อที่แสดง</th>
                    <th className="pb-2">รถที่มอบหมาย</th>
                    <th className="pb-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map(d => (
                    <tr key={d.id} className="border-t border-slate-100">
                      <td className="py-2">{d.username}</td>
                      <td className="py-2">{d.displayName}</td>
                      <td className="py-2">{d.vehicleName ?? <span className="text-slate-400">ยังไม่ระบุ</span>}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button onClick={() => handleResetPassword(d.id)} className="text-slate-400 hover:text-fleet-navy mr-2" title="ตั้งรหัสผ่านใหม่">
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(d.id)} className="text-slate-400 hover:text-alert-red" title="ลบ">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
