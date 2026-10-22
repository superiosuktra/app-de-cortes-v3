import React, { useState } from 'react';
import { Download, Monitor, CheckCircle, Laptop } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PWAInstallModal } from './PWAInstallModal';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'compact' | 'full' | 'banner';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'compact',
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClick = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (!outcome) {
        setIsModalOpen(true);
      }
    } else {
      setIsModalOpen(true);
    }
  };

  if (isInstalled && variant === 'banner') {
    return null;
  }

  if (isInstalled) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 rounded-lg">
        <CheckCircle className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Modo Aplicativo Ativo</span>
      </span>
    );
  }

  if (variant === 'banner') {
    return (
      <>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-purple-950/50 via-[#161726] to-pink-950/40 border border-purple-500/30 rounded-2xl shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0">
              <Laptop className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                Instale no seu Computador como Aplicativo
                <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 text-[10px] rounded-full border border-emerald-500/30">
                  PWA
                </span>
              </p>
              <p className="text-[11px] text-zinc-400">
                Execute sem a barra do navegador, com atalho na Área de Trabalho e salvamento permanente sem precisar de backups.
              </p>
            </div>
          </div>
          <button
            onClick={handleClick}
            className="flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl shadow-md shadow-purple-600/20 transition active:scale-95 shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Instalar App no PC
          </button>
        </div>
        <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-200 bg-purple-950/50 hover:bg-purple-900/60 border border-purple-500/30 hover:border-purple-500/50 rounded-xl transition shadow-sm ${className}`}
        title="Instalar AI Viral Shorts Cutter no seu computador como um aplicativo desktop"
      >
        <Laptop className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <span className="hidden sm:inline">Instalar no PC</span>
        <span className="sm:hidden">App</span>
      </button>
      <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
