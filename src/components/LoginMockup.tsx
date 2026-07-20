import React, { useState } from 'react';
import { ArrowRight, LockKeyhole, User as UserIcon } from 'lucide-react';
import AppLogo from './AppLogo';
import { login, CurrentUser } from '../lib/api';

interface LoginMockupProps {
  onSignIn: (user: CurrentUser) => void;
}

export default function LoginMockup({ onSignIn }: LoginMockupProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await login(username, password);
      onSignIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-canvas px-4 py-6 text-[#333333] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center">
        <header className="mb-6">
          <AppLogo className="mx-auto w-56" />
        </header>

        <section>
          <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-fleet-navy">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                RouteWay Intelligence — เข้าสู่ระบบด้วยบัญชีที่ผู้ดูแลระบบสร้างให้
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-md border border-alert-red/30 bg-red-50 px-3 py-2 text-sm font-semibold text-alert-red">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Username</span>
                <span className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 focus-within:border-fleet-navy focus-within:ring-2 focus-within:ring-fleet-navy">
                  <UserIcon className="h-5 w-5 text-slate-500" aria-hidden="true" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-500"
                    placeholder="username"
                    autoComplete="username"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
                <span className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 focus-within:border-fleet-navy focus-within:ring-2 focus-within:ring-fleet-navy">
                  <LockKeyhole className="h-5 w-5 text-slate-500" aria-hidden="true" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-500"
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                </span>
              </label>
            </div>

            <div className="mt-6">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-fleet-navy px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-fleet-navy-hover focus:outline-none focus:ring-2 focus:ring-fleet-navy focus:ring-offset-2 disabled:opacity-50"
              >
                {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'Sign in'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </form>

          <a
            href="?care=1"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-bold text-white transition-colors"
            style={{ backgroundColor: 'var(--color-care-navy)' }}
          >
            Try RouteWay Care
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </section>
      </div>
    </main>
  );
}
