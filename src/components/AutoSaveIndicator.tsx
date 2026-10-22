import React, { useState } from 'react';
import { CloudCheck, ShieldCheck, Database, Check, RefreshCw, Info } from 'lucide-react';

interface AutoSaveIndicatorProps {
  lastSavedAt: string | null;
  isSaving?: boolean;
  onManualSync?: () => void;
}

export const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({
  lastSavedAt,
  isSaving = false,
  onManualSync,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const formattedTime = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Agora';

  return (
    <div className="relative">
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/25 hover:border-emerald-500/40 text-[11px] text-emerald-300 transition group"
        title="Seus dados estão sendo salvos automaticamente sem precisar de backup manual"
      >
        {isSaving ? (
          <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
        ) : (
          <CloudCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        )}
        <span className="font-semibold hidden sm:inline">Auto-Salvo</span>
        <span className="text-[10px] text-emerald-400/70 font-mono hidden md:inline">({formattedTime})</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      </button>

      {/* Info Tooltip Popover */}
      {showTooltip && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 p-3.5 bg-[#141624] border border-emerald-500/30 rounded-xl shadow-2xl text-xs space-y-2 text-zinc-300 animate-in fade-in zoom-in-95">
          <div className="flex items-center gap-2 text-emerald-400 font-bold border-b border-zinc-800 pb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Salvamento Automático Ativo</span>
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            Seus cortes salvos, fila de postagens e credenciais são gravados continuamente de forma dupla:
            <strong> no armazenamento local e no disco persistente</strong>.
          </p>
          <div className="p-2 bg-emerald-950/30 border border-emerald-500/20 rounded-lg text-[10px] text-emerald-300/90 font-medium space-y-1">
            <div className="flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-400" />
              <span>Sem necessidade de fazer backup manual</span>
            </div>
            <div className="flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-400" />
              <span>Dados preservados ao fechar ou reabrir</span>
            </div>
          </div>
          {onManualSync && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onManualSync();
              }}
              className="w-full mt-1 py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw className="w-3 h-3 text-emerald-400" />
              Forçar Sincronização Agora
            </button>
          )}
        </div>
      )}
    </div>
  );
};
