import React, { useState } from 'react';
import {
  Youtube,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Check,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Key,
  Eye,
  EyeOff,
  Copy,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { PlatformCredentials } from '../../types';

export interface YouTubeSettingsCardProps {
  creds: PlatformCredentials;
  setCreds: React.Dispatch<React.SetStateAction<PlatformCredentials>>;
  onSaveCredentials: (creds: PlatformCredentials) => void;
  showTokens: { [key: string]: boolean };
  setShowTokens: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;
  handleDisconnect: (platform: 'youtube' | 'instagram' | 'tiktok' | 'kwai') => void;
  handleTestPlatform: (platform: 'youtube' | 'instagram' | 'tiktok' | 'kwai') => Promise<void>;
  testingPlatform: string | null;
  testResults: {
    [key: string]: {
      success: boolean;
      message: string;
      details?: any;
      isAuthCode?: boolean;
      hint?: string;
    };
  };
  handleActivateDemoYouTube: () => void;
  copiedScope: string | null;
  handleCopyScope: (scope: string) => void;
  isConnectingGoogle: boolean;
  handleGoogleQuickConnect: (rawInput?: string, openPopupIfNeeded?: boolean) => Promise<boolean>;
  isGooglePopupOpen: boolean;
  setIsGooglePopupOpen: (open: boolean) => void;
  openGoogleAuthPopup: () => void;
  googleQuickPasteInput: string;
  setGoogleQuickPasteInput: (input: string) => void;
  onNavigateToTab?: (tab: 'trending' | 'analyze' | 'editor' | 'publish') => void;
}

export const YouTubeSettingsCard: React.FC<YouTubeSettingsCardProps> = ({
  creds,
  setCreds,
  onSaveCredentials,
  showTokens,
  setShowTokens,
  handleDisconnect,
  handleTestPlatform,
  testingPlatform,
  testResults,
  handleActivateDemoYouTube,
  copiedScope,
  handleCopyScope,
  isConnectingGoogle,
  handleGoogleQuickConnect,
  isGooglePopupOpen,
  setIsGooglePopupOpen,
  openGoogleAuthPopup,
  googleQuickPasteInput,
  setGoogleQuickPasteInput,
  onNavigateToTab,
}) => {
  const [showAdvancedManual, setShowAdvancedManual] = useState(false);

  return (
    <div className="bg-[#141520] border border-zinc-800 hover:border-red-500/40 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-600/10 border border-red-500/30 flex items-center justify-center text-red-500 shadow-md">
            <Youtube className="w-6 h-6 fill-red-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-white">YouTube Shorts</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300">
                YouTube Data API v3
              </span>
            </div>
            <p className="text-xs text-zinc-400">OAuth 2.0 com escopo de upload direto para o canal</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 ${
              creds.youtube.status === 'connected'
                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                : creds.youtube.status === 'error'
                ? 'bg-red-950/60 text-red-300 border border-red-500/40'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {creds.youtube.status === 'connected' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Conectado</span>
              </>
            ) : creds.youtube.status === 'error' ? (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                <span>Token Inválido</span>
              </>
            ) : (
              <span>Desconectado</span>
            )}
          </span>

          <button
            onClick={() => handleDisconnect('youtube')}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition"
            title="Limpar Token do YouTube"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Connected Profile Preview if available */}
      {creds.youtube.channelTitle && creds.youtube.status === 'connected' && (
        <div className="p-3.5 bg-emerald-950/25 border border-emerald-500/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {creds.youtube.avatar ? (
              <img
                src={creds.youtube.avatar}
                alt="Canal"
                className="w-11 h-11 rounded-full border-2 border-emerald-500/50"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-red-600 flex items-center justify-center text-white font-bold">
                YT
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-white">{creds.youtube.channelTitle}</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Login Google Ativo
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {creds.youtube.customUrl || 'Canal Autenticado'} • Renovação Automática Permanente • Verificado às{' '}
                {creds.youtube.verifiedAt || 'agora'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openGoogleAuthPopup()}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[11px] font-bold transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Trocar Conta Google</span>
            </button>
            <span className="text-xs text-emerald-400 font-bold flex items-center gap-1 px-2">
              <Check className="w-4 h-4" /> Pronto
            </span>
          </div>
        </div>
      )}

      {/* 1-CLICK GOOGLE LOGIN HERO BOX */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-[#1a1c2e] via-[#1f1930] to-[#261726] border border-white/15 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              NOVO • CONEXÃO RÁPIDA COM 1 CLIQUE
            </div>
            <h4 className="text-sm sm:text-base font-black text-white">
              Conectar Canal Apenas Fazendo Login com o Google
            </h4>
            <p className="text-xs text-zinc-300 max-w-xl leading-relaxed">
              Esqueça configurações manuais complicadas. Clique no botão ao lado para entrar com sua conta do Google e ativar a renovação automática permanente do seu canal.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={isConnectingGoogle}
              onClick={() => handleGoogleQuickConnect('', true)}
              className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white hover:bg-zinc-100 text-zinc-900 font-extrabold text-xs sm:text-sm shadow-xl shadow-black/40 hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-60 cursor-pointer"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              <span>
                {isConnectingGoogle
                  ? 'Conectando ao Google...'
                  : creds.youtube.status === 'connected'
                  ? 'Reconectar com o Google'
                  : 'Entrar com o Google'}
              </span>
            </button>

            {creds.youtube.refreshToken && creds.youtube.status !== 'connected' && (
              <button
                type="button"
                disabled={isConnectingGoogle}
                onClick={() => handleGoogleQuickConnect('', false)}
                className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isConnectingGoogle ? 'animate-spin' : ''}`} />
                <span>Restaurar Canal Salvo (1 Clique)</span>
              </button>
            )}
          </div>
        </div>

        {/* Interactive Helper when Google Popup is Opened */}
        {isGooglePopupOpen && (
          <div className="p-4 rounded-xl bg-black/60 border border-blue-500/40 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-300 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                Janela de Login do Google aberta! Siga os 2 passos rápidos:
              </span>
              <button
                type="button"
                onClick={() => setIsGooglePopupOpen(false)}
                className="text-[10px] text-zinc-400 hover:text-white"
              >
                Fechar ajuda
              </button>
            </div>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              1. Na janela que se abriu, selecione sua conta e autorize o canal.<br />
              2. Caso a janela não feche sozinha, copie o link da barra de endereços dela e cole no campo abaixo:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={googleQuickPasteInput}
                onChange={(e) => setGoogleQuickPasteInput(e.target.value)}
                placeholder="Cole o link da página do Google aqui (ex: http://localhost:3000/api/auth/google/callback?code=...)"
                className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 font-mono"
              />
              <button
                type="button"
                disabled={!googleQuickPasteInput.trim() || isConnectingGoogle}
                onClick={() => handleGoogleQuickConnect(googleQuickPasteInput)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Finalizar Conexão</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Demo Channel Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-purple-950/20 border border-purple-500/30 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Quer apenas testar sem configurar chaves agora?</h4>
            <p className="text-[11px] text-zinc-400">Ative o canal em Modo Demonstração com 1 clique.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleActivateDemoYouTube}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-950/40"
        >
          <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
          <span>Ativar Canal Demo</span>
        </button>
      </div>

      {/* Test / Diagnostic feedback */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          disabled={testingPlatform === 'youtube'}
          onClick={() => handleTestPlatform('youtube')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-md shadow-red-950/40"
        >
          {testingPlatform === 'youtube' ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Validando no YouTube...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Testar Conexão com o YouTube</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowAdvancedManual(!showAdvancedManual)}
          className="text-xs text-zinc-400 hover:text-white transition flex items-center gap-1 cursor-pointer"
        >
          <span>{showAdvancedManual ? 'Ocultar configurações avançadas de Client ID' : 'Configurações manuais de Client ID / Token'}</span>
          <span>{showAdvancedManual ? '▲' : '▼'}</span>
        </button>
      </div>

      {testResults.youtube && (
        <div
          className={`p-4 rounded-2xl border text-xs space-y-1.5 animate-fadeIn ${
            testResults.youtube.success
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/30 border-red-500/40 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            {testResults.youtube.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{testResults.youtube.message}</span>
          </div>
          {testResults.youtube.details && (
            <p className="text-[11px] text-zinc-300">{testResults.youtube.details}</p>
          )}
        </div>
      )}

      {/* Advanced Manual Inputs Accordion */}
      {showAdvancedManual && (
        <div className="space-y-4 p-4 bg-black/40 border border-zinc-800 rounded-2xl animate-fadeIn">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span>Access Token (Bearer ya29...)</span>
              <button
                type="button"
                onClick={() => setShowTokens((prev) => ({ ...prev, youtube: !prev.youtube }))}
                className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1"
              >
                {showTokens.youtube ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showTokens.youtube ? 'Ocultar' : 'Revelar'}</span>
              </button>
            </label>
            <input
              type={showTokens.youtube ? 'text' : 'password'}
              value={creds.youtube.accessToken}
              onChange={(e) => {
                const updated = {
                  ...creds,
                  youtube: { ...creds.youtube, accessToken: e.target.value },
                };
                setCreds(updated);
              }}
              placeholder="ya29.a0AfH6SM..."
              className="w-full px-4 py-2.5 bg-[#0e0f17] border border-zinc-700/80 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">Client ID (OAuth)</label>
              <input
                type="text"
                value={creds.youtube.clientId}
                onChange={(e) => {
                  const updated = {
                    ...creds,
                    youtube: { ...creds.youtube, clientId: e.target.value },
                  };
                  setCreds(updated);
                }}
                placeholder="123456789-abc.apps.googleusercontent.com"
                className="w-full px-4 py-2 bg-[#0e0f17] border border-zinc-700/80 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">Client Secret (OAuth)</label>
              <input
                type="password"
                value={creds.youtube.clientSecret}
                onChange={(e) => {
                  const updated = {
                    ...creds,
                    youtube: { ...creds.youtube, clientSecret: e.target.value },
                  };
                  setCreds(updated);
                }}
                placeholder="GOCSPX-..."
                className="w-full px-4 py-2 bg-[#0e0f17] border border-zinc-700/80 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
