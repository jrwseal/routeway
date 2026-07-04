import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ComparisonResult } from '../types';
import AlgorithmComparison from './AlgorithmComparison';

interface Props {
  data: ComparisonResult[];
  onClose: () => void;
  onSelectVariant: (idx: number) => void;
}

export default function ComparisonPopup({ data, onClose, onSelectVariant }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-5xl max-h-[85vh] rounded-2xl shadow-xl overflow-y-auto animate-slide-up relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>
        <AlgorithmComparison data={data} onSelectVariant={onSelectVariant} />
      </div>
    </div>
  );
}
