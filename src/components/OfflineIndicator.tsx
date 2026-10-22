import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600/95 border border-amber-400/40 px-3.5 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-md animate-in slide-in-from-bottom-2">
      <WifiOff className="w-4 h-4 shrink-0 text-amber-200 animate-pulse" />
      <span>Modo Offline — O aplicativo continua disponível usando cache local.</span>
    </div>
  );
};
