import React from 'react';
import { Download, Monitor, Laptop, CheckCircle2, X, ExternalLink, Smartphone, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, isMac, isWindows, install } = usePWAInstall();

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (success) {
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#11121c] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-[#161726]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-600 to-rose-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Laptop className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Instalar no seu Computador
                <span className="px-2 py-0.5 text-[10px] uppercase font-black bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full">
                  App PWA Desktop
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Execute o AI Viral Shorts Cutter nativamente no seu Mac, Windows ou Linux
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Status Badge */}
          {isInstalled ? (
            <div className="flex items-center gap-3 p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold">Aplicativo já instalado com sucesso!</p>
                <p className="text-[11px] text-emerald-400/80">
                  Você já está executando o AI Viral Shorts Cutter no modo standalone no seu computador.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gradient-to-r from-purple-950/40 to-pink-950/30 border border-purple-500/20 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-purple-300 text-xs font-bold">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Vantagens de instalar como Aplicativo no Computador:
              </div>
              <ul className="text-xs text-zinc-300 space-y-1.5 list-disc list-inside">
                <li><strong>Sem barra do navegador:</strong> Abre em janela própria limpa e focada.</li>
                <li><strong>Atalho na Área de Trabalho & Barra de Tarefas:</strong> Início com 1 clique.</li>
                <li><strong>Armazenamento 100% Permanente:</strong> Todas as configurações e cortes salvos sem perdas.</li>
                <li><strong>Desempenho Otimizado:</strong> Cache inteligente ultra rápido.</li>
              </ul>
            </div>
          )}

          {/* Quick 1-Click Install Button if supported */}
          {isInstallable && !isInstalled && (
            <div className="pt-1">
              <button
                onClick={handleInstallClick}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:opacity-95 shadow-lg shadow-purple-600/30 transition active:scale-[0.99]"
              >
                <Download className="w-4 h-4 animate-bounce" />
                Instalar Aplicativo Agora (1 Clique)
              </button>
            </div>
          )}

          {/* Manual Instructions for Chrome, Edge, Safari */}
          <div className="space-y-3 pt-2 border-t border-zinc-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Como instalar manualmente pelo navegador:
            </h4>

            {/* Google Chrome & Microsoft Edge */}
            <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-zinc-200">
                <Monitor className="w-4 h-4 text-cyan-400" />
                No Google Chrome ou Microsoft Edge (Windows / Mac / Linux):
              </div>
              <p className="text-zinc-400 leading-relaxed text-[11px]">
                1. Olhe na <strong>barra de endereço</strong> do navegador (onde fica o link).<br />
                2. Clique no ícone de <strong>computador com seta para baixo 💻⬇️</strong> (ou símbolo de adicionar "+") ao lado da estrela de favoritos.<br />
                3. Ou clique nos <strong>três pontinhos (...) &gt; "Instalar AI Viral Shorts Cutter"</strong> ou <strong>"Criar atalho..."</strong>.<br />
                4. Clique em <strong>Instalar</strong>. Pronto! O app abrirá em uma janela própria e ficará na sua área de trabalho.
              </p>
            </div>

            {/* Mac / Apple Safari */}
            <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-zinc-200">
                <Laptop className="w-4 h-4 text-purple-400" />
                No Safari (macOS Sonoma ou superior):
              </div>
              <p className="text-zinc-400 leading-relaxed text-[11px]">
                1. Clique em <strong>Arquivo</strong> no menu superior do Mac.<br />
                2. Selecione <strong>"Adicionar ao Dock..."</strong>.<br />
                3. O ícone do app aparecerá diretamente no seu Dock do Mac como um app nativo.
              </p>
            </div>

            {/* Mobile / Tablets */}
            <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-zinc-200">
                <Smartphone className="w-4 h-4 text-pink-400" />
                No Celular (iPhone / Android):
              </div>
              <p className="text-zinc-400 leading-relaxed text-[11px]">
                No Safari (iOS): Toque no botão <strong>Compartilhar</strong> e selecione <strong>"Adicionar à Tela de Início"</strong>.<br />
                No Chrome (Android): Toque nos 3 pontos e selecione <strong>"Instalar aplicativo"</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#141522] border-t border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Progresso e dados são salvos automaticamente sem necessidade de backup
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
