import React, { useEffect, useState } from 'react';
import { DriverAccount, listDrivers, createDriver, deleteDriver } from '../lib/api';
import { Trash2, UserPlus } from 'lucide-react';

export default function DriverManagement() {
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = () => {
    listDrivers().then(setDrivers).finally(() => setIsLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createDriver(username, password, displayName);
      setUsername('');
      setPassword('');
      setDisplayName('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างบัญชีคนขับไม่สำเร็จ');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('ลบบัญชีคนขับนี้?')) return;
    await deleteDriver(id);
    refresh();
  };

  return (
    <div className="p-4 sm:p-8 pb-20 animate-fade-in w-full max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-fleet-navy mb-2">จัดการบัญชีคนขับ</h1>
        <p className="text-lg font-medium text-slate-600">Driver Account Management</p>
      </div>

      <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">ชื่อผู้ใช้</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">รหัสผ่าน</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1">ชื่อที่แสดง</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" required />
        </div>
        <button type="submit" className="flex items-center justify-center bg-fleet-navy text-white rounded px-4 py-2 text-sm font-bold hover:bg-blue-800">
          <UserPlus className="w-4 h-4 mr-2" /> เพิ่มคนขับ
        </button>
        {error && <div className="sm:col-span-4 text-alert-red text-sm">{error}</div>}
      </form>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">ชื่อผู้ใช้</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">ชื่อที่แสดง</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && drivers.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">ยังไม่มีบัญชีคนขับ</td></tr>
            )}
            {drivers.map(d => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">{d.username}</td>
                <td className="px-4 py-3">{d.displayName}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(d.id)} className="text-slate-400 hover:text-alert-red">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
