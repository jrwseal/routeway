import React from 'react';
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react';
import AppLogo from './AppLogo';

interface LoginMockupProps {
  onSignIn: () => void;
}

export default function LoginMockup({ onSignIn }: LoginMockupProps) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSignIn();
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
                  Use any values for this mockup. Authentication is not connected yet.
                </p>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Email address</span>
                  <span className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 focus-within:border-fleet-navy focus-within:ring-2 focus-within:ring-fleet-navy">
                    <Mail className="h-5 w-5 text-slate-500" aria-hidden="true" />
                    <input
                      type="email"
                      defaultValue="planner@routeway.local"
                      className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-500"
                      placeholder="planner@company.com"
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
                  <span className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 focus-within:border-fleet-navy focus-within:ring-2 focus-within:ring-fleet-navy">
                    <LockKeyhole className="h-5 w-5 text-slate-500" aria-hidden="true" />
                    <input
                      type="password"
                      defaultValue="routeway"
                      className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-500"
                      placeholder="Enter password"
                    />
                  </span>
                </label>
              </div>

              <div className="mt-5 flex items-center justify-between gap-4 text-sm">
                <label className="flex items-center gap-2 font-semibold text-slate-600">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-fleet-navy focus:ring-fleet-navy" defaultChecked />
                  Remember workstation
                </label>
                <button type="button" className="font-bold text-fleet-navy hover:text-fleet-navy-hover">
                  Forgot password?
                </button>
              </div>

              <div className="mt-6 space-y-3">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-fleet-navy px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-fleet-navy-hover focus:outline-none focus:ring-2 focus:ring-fleet-navy focus:ring-offset-2"
                >
                  Sign in
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="w-full rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-fleet-navy focus:ring-offset-2"
                >
                  Use demo mode
                </button>
              </div>
            </form>
        </section>
      </div>
    </main>
  );
}
