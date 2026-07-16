import React, { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { readManifestFile } from '../lib/csvParser';
import type { RouteNode } from '../types';

export default function CareCsvUpload({ onLoaded }: { onLoaded: (nodes: RouteNode[]) => void }) {
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readManifestFile(file)
      .then(nodes => {
        setError(null);
        onLoaded(nodes);
      })
      .catch((err: Error) => setError(err.message));
    e.target.value = '';
  };

  return (
    <div className="px-4 py-2 flex items-center gap-3" style={{ fontFamily: 'var(--font-care-body)' }}>
      <label
        className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md cursor-pointer"
        style={{ backgroundColor: 'white', color: 'var(--color-care-navy)', border: '1px solid rgba(11,37,69,0.2)' }}
      >
        <UploadCloud className="w-3.5 h-3.5" />
        Upload Manifest (.csv)
        <input type="file" accept=".csv" onChange={handleChange} className="hidden" />
      </label>
      {error && (
        <span className="text-xs" style={{ color: 'var(--color-care-critical)' }}>
          {error}
        </span>
      )}
    </div>
  );
}
