import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-neutral-canvas">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
        <h1 className="text-2xl font-bold text-fleet-navy mb-1">RouteWay</h1>
        <p className="text-sm text-slate-500 mb-6">เข้าสู่ระบบเพื่อดำเนินการต่อ</p>

        {error && (
          <div className="bg-red-50 text-alert-red text-sm rounded-lg px-3 py-2 mb-4">{error}</div>
        )}

        <label className="text-sm font-semibold text-slate-700 block mb-1">ชื่อผู้ใช้</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-4 py-2.5 mb-4 text-slate-800 focus:ring-2 focus:ring-fleet-navy focus:outline-none"
          required
        />

        <label className="text-sm font-semibold text-slate-700 block mb-1">รหัสผ่าน</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-4 py-2.5 mb-6 text-slate-800 focus:ring-2 focus:ring-fleet-navy focus:outline-none"
          required
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-fleet-navy hover:bg-blue-800 text-white font-bold py-3 rounded-lg shadow-md transition-all disabled:opacity-50"
        >
          {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}
