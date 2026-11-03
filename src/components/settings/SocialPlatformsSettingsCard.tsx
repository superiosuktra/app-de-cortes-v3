import React from 'react';
import {
  Instagram,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Check,
  RefreshCw,
  ShieldCheck,
  HelpCircle,
  ExternalLink,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { PlatformCredentials } from '../../types';
import confetti from 'canvas-confetti';

export interface SocialPlatformsSettingsCardProps {
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
  setIsTikTokGuideOpen: (open: boolean) => void;
}

export const SocialPlatformsSettingsCard: React.FC<SocialPlatformsSettingsCardProps> = ({
  creds,
  setCreds,
  onSaveCredentials,
  showTokens,
  setShowTokens,
  handleDisconnect,
  handleTestPlatform,
  testingPlatform,
  testResults,
  setIsTikTokGuideOpen,
}) => {
  const toggleShowToken = (platform: string) => {
    setShowTokens((prev) => ({ ...prev, [platform]: !prev[platform] }));
  };

  return (
    <>
      {/* 2. INSTAGRAM REELS (META GRAPH API) CARD */}
      <div className="bg-[#141520] border border-zinc-800 hover:border-pink-500/40 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-pink-600/10 border border-pink-500/30 flex items-center justify-center text-pink-500 shadow-md">
              <Instagram className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">Instagram Reels</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300">
                  Meta Graph API (v19+)
                </span>
              </div>
              <p className="text-xs text-zinc-400">Instagram Content Publishing API para Contas Comerciais / Criadores</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 ${
                creds.instagram.status === 'connected'
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                  : creds.instagram.status === 'error'
                  ? 'bg-red-950/60 text-red-300 border border-red-500/40'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {creds.instagram.status === 'connected' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Conectado</span>
                </>
              ) : creds.instagram.status === 'error' ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  <span>Token Inválido</span>
                </>
              ) : (
                <span>Desconectado</span>
              )}
            </span>

            <button
              onClick={() => handleDisconnect('instagram')}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition"
              title="Limpar Token do Instagram"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Connected Profile Preview if available */}
        {creds.instagram.accountName && creds.instagram.status === 'connected' && (
          <div className="p-3 bg-pink-950/20 border border-pink-500/30 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              {creds.instagram.avatar ? (
                <img src={creds.instagram.avatar} alt="Instagram" className="w-10 h-10 rounded-full border border-zinc-700" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-500 via-pink-600 to-purple-600 flex items-center justify-center text-white font-bold">
                  IG
                </div>
              )}
              <div>
                <h4 className="text-sm font-bold text-white">{creds.instagram.accountName}</h4>
                <p className="text-[11px] text-zinc-400">
                  Conta Comercial Autenticada • Verificado às {creds.instagram.verifiedAt || 'agora'}
                </p>
              </div>
            </div>
            <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
              <Check className="w-4 h-4" /> Pronto para Reels
            </span>
          </div>
        )}

        {/* Inputs Row */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
              <span>Meta User / Page Access Token</span>
              <span className="text-[10px] text-pink-400 font-mono">Permissão instagram_content_publish</span>
            </label>
            <div className="relative">
              <input
                type={showTokens.instagram ? 'text' : 'password'}
                value={creds.instagram.accessToken}
                onChange={(e) =>
                  setCreds({
                    ...creds,
                    instagram: { ...creds.instagram, accessToken: e.target.value },
                  })
                }
                placeholder="EAA..."
                className="w-full pl-3.5 pr-20 py-2.5 bg-[#0e0f17] border border-zinc-700/80 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleShowToken('instagram')}
                  className="p-1.5 text-zinc-400 hover:text-white transition"
                  title={showTokens.instagram ? 'Ocultar' : 'Exibir'}
                >
                  {showTokens.instagram ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleTestPlatform('instagram')}
                  disabled={testingPlatform === 'instagram'}
                  className="px-2.5 py-1 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  {testingPlatform === 'instagram' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                  <span>Testar</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-400">Instagram Business Account ID (Opcional)</label>
              <input
                type="text"
                value={creds.instagram.businessAccountId || ''}
                onChange={(e) =>
                  setCreds({
                    ...creds,
                    instagram: { ...creds.instagram, businessAccountId: e.target.value },
                  })
                }
                placeholder="17841400..."
                className="w-full px-3 py-2 bg-[#0e0f17] border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-400">Meta App ID (Opcional)</label>
              <input
                type="text"
                value={creds.instagram.appId || ''}
                onChange={(e) =>
                  setCreds({
                    ...creds,
                    instagram: { ...creds.instagram, appId: e.target.value },
                  })
                }
                placeholder="Ex: 849302910..."
                className="w-full px-3 py-2 bg-[#0e0f17] border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>

        {/* Quick Guide & Scopes Accordion */}
        <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-2xl text-xs text-zinc-400 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-zinc-300">
            <span className="flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-pink-400" />
              Como gerar o token no Meta for Developers:
            </span>
            <a
              href="https://developers.facebook.com/tools/explorer/"
              target="_blank"
              rel="noreferrer"
              className="text-purple-400 hover:text-purple-300 underline inline-flex items-center gap-1"
            >
              Graph API Explorer <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <p className="text-[11px]">
            Vá no <strong>Graph API Explorer</strong> do Meta for Developers, selecione seu App Business e adicione as 3 permissões indispensáveis:
          </p>

          <div className="flex flex-wrap gap-2 p-2 bg-black/80 rounded-xl font-mono text-[11px] text-yellow-300 border border-zinc-800">
            <span className="px-1.5 py-0.5 bg-zinc-900 rounded">instagram_content_publish</span>
            <span className="px-1.5 py-0.5 bg-zinc-900 rounded">instagram_basic</span>
            <span className="px-1.5 py-0.5 bg-zinc-900 rounded">pages_show_list</span>
          </div>
        </div>

        {/* Diagnostic Status Feedback */}
        {testResults.instagram && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              testResults.instagram.success
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                : 'bg-red-950/40 border-red-500/50 text-red-200'
            }`}
          >
            {testResults.instagram.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">{testResults.instagram.message}</p>
              {testResults.instagram.details && <p className="text-[11px] text-zinc-300 mt-0.5">{testResults.instagram.details}</p>}
            </div>
          </div>
        )}
      </div>

      {/* 3. TIKTOK CONTENT POSTING API CARD */}
      <div className="bg-[#141520] border border-zinc-800 hover:border-cyan-400/40 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-cyan-600/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-md font-black text-lg">
              TT
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">TikTok</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300">
                  Content Posting API v2
                </span>
              </div>
              <p className="text-xs text-zinc-400">Direct Post API para publicação direta no feed do TikTok</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 ${
                creds.tiktok.status === 'connected'
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                  : creds.tiktok.status === 'error'
                  ? 'bg-red-950/60 text-red-300 border border-red-500/40'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {creds.tiktok.status === 'connected' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Conectado</span>
                </>
              ) : creds.tiktok.status === 'error' ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  <span>Token Inválido</span>
                </>
              ) : (
                <span>Desconectado</span>
              )}
            </span>

            <button
              onClick={() => handleDisconnect('tiktok')}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition"
              title="Limpar Token do TikTok"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Connected Profile Preview if available */}
        {creds.tiktok.displayName && creds.tiktok.status === 'connected' && (
          <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              {creds.tiktok.avatar ? (
                <img src={creds.tiktok.avatar} alt="TikTok" className="w-10 h-10 rounded-full border border-zinc-700" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-cyan-600 flex items-center justify-center text-white font-bold">
                  TT
                </div>
              )}
              <div>
                <h4 className="text-sm font-bold text-white">{creds.tiktok.displayName}</h4>
                <p className="text-[11px] text-zinc-400">
                  Conta TikTok Autenticada • Verificado às {creds.tiktok.verifiedAt || 'agora'}
                </p>
              </div>
            </div>
            <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
              <Check className="w-4 h-4" /> Pronto para TikTok
            </span>
          </div>
        )}

        {/* Inputs Row */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
              <span>User Access Token (Bearer Token)</span>
              <span className="text-[10px] text-cyan-400 font-mono">Escopos video.upload & video.publish</span>
            </label>
            <div className="relative">
              <input
                type={showTokens.tiktok ? 'text' : 'password'}
                value={creds.tiktok.accessToken}
                onChange={(e) =>
                  setCreds({
                    ...creds,
                    tiktok: { ...creds.tiktok, accessToken: e.target.value },
                  })
                }
                placeholder="act.example123..."
                className="w-full pl-3.5 pr-20 py-2.5 bg-[#0e0f17] border border-zinc-700/80 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleShowToken('tiktok')}
                  className="p-1.5 text-zinc-400 hover:text-white transition"
                  title={showTokens.tiktok ? 'Ocultar' : 'Exibir'}
                >
                  {showTokens.tiktok ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleTestPlatform('tiktok')}
                  disabled={testingPlatform === 'tiktok'}
                  className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  {testingPlatform === 'tiktok' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                  <span>Testar</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-400">Client Key (Opcional)</label>
              <input
                type="text"
                value={creds.tiktok.clientKey || ''}
                onChange={(e) =>
                  setCreds({
                    ...creds,
                    tiktok: { ...creds.tiktok, clientKey: e.target.value },
                  })
                }
                placeholder="aw..."
                className="w-full px-3 py-2 bg-[#0e0f17] border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-zinc-400">Client Secret (Opcional)</label>
              <input
                type="password"
                value={creds.tiktok.clientSecret || ''}
                onChange={(e) =>
                  setCreds({
                    ...creds,
                    tiktok: { ...creds.tiktok, clientSecret: e.target.value },
                  })
                }
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-[#0e0f17] border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>

        {/* Quick Guide & Scopes Accordion */}
        <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl text-xs text-zinc-400 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-bold text-zinc-300">
            <span className="flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-cyan-400" />
              Como registrar e aprovar o app no TikTok for Developers:
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsTikTokGuideOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-90 text-white text-[11px] font-bold flex items-center gap-1 shadow-md shadow-cyan-900/30 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>📋 Guia de Revisão: O que Preencher</span>
              </button>
              <a
                href="https://developers.tiktok.com"
                target="_blank"
                rel="noreferrer"
                className="text-purple-400 hover:text-purple-300 underline inline-flex items-center gap-1"
              >
                developers.tiktok.com <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <p className="text-[11px]">
            No portal do TikTok, adicione a <strong>Content Posting API</strong> e autorize o escopo para publicação direta:
          </p>

          <div className="flex flex-wrap gap-2 p-2 bg-black/80 rounded-xl font-mono text-[11px] text-cyan-300 border border-zinc-800">
            <span className="px-1.5 py-0.5 bg-zinc-900 rounded">video.upload</span>
            <span className="px-1.5 py-0.5 bg-zinc-900 rounded">video.publish</span>
            <span className="px-1.5 py-0.5 bg-zinc-900 rounded">user.info.basic</span>
          </div>
        </div>

        {/* Diagnostic Status Feedback */}
        {testResults.tiktok && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              testResults.tiktok.success
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                : 'bg-red-950/40 border-red-500/50 text-red-200'
            }`}
          >
            {testResults.tiktok.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">{testResults.tiktok.message}</p>
              {testResults.tiktok.details && <p className="text-[11px] text-zinc-300 mt-0.5">{testResults.tiktok.details}</p>}
            </div>
          </div>
        )}
      </div>

      {/* 3.5. KWAI OPEN PLATFORM CARD */}
      <div className="bg-[#141520] border border-zinc-800 hover:border-orange-500/40 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-600/10 border border-orange-500/30 flex items-center justify-center text-white shadow-md">
              <span className="text-xl font-black text-orange-400">K</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">Kwai Open Platform</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-950/80 border border-orange-500/40 text-orange-300">
                  Direct Post API
                </span>
              </div>
              <p className="text-xs text-zinc-400">Publicação direta no feed do Kwai com títulos, legendas e hashtags virais</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 ${
                creds.kwai?.status === 'connected'
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                  : creds.kwai?.status === 'error'
                  ? 'bg-red-950/60 text-red-300 border border-red-500/40'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {creds.kwai?.status === 'connected' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Conectado</span>
                </>
              ) : creds.kwai?.status === 'error' ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  <span>Token Inválido</span>
                </>
              ) : (
                <span>Desconectado</span>
              )}
            </span>

            <button
              onClick={() => handleDisconnect('kwai')}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition"
              title="Limpar Token do Kwai"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Connected Profile Preview if available */}
        {creds.kwai?.accountName && creds.kwai?.status === 'connected' && (
          <div className="p-3 bg-orange-950/20 border border-orange-500/30 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              {creds.kwai?.avatar ? (
                <img src={creds.kwai.avatar} alt="Kwai" className="w-10 h-10 rounded-full border border-zinc-700" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-white font-bold text-sm">
                  KW
                </div>
              )}
              <div>
                <h4 className="text-sm font-bold text-white">{creds.kwai.accountName}</h4>
                <p className="text-[11px] text-zinc-400">
                  Conta Kwai Oficial Autenticada • Verificado às {creds.kwai.verifiedAt || 'agora'}
                </p>
              </div>
            </div>
            <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
              <Check className="w-4 h-4" /> Pronto para Kwai
            </span>
          </div>
        )}

        {/* Inputs Row */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
              <span>Access Token (Bearer Token Kwai Open Platform)</span>
              <span className="text-[10px] text-orange-400 font-mono">open.kwai.com</span>
            </label>
            <div className="relative">
              <input
                type={showTokens.kwai ? 'text' : 'password'}
                value={creds.kwai?.accessToken || ''}
                onChange={(e) =>
                  setCreds({
                    ...creds,
                    kwai: {
                      ...(creds.kwai || { status: 'disconnected' as const }),
                      accessToken: e.target.value,
                      status: e.target.value ? (creds.kwai?.status === 'connected' ? 'connected' : 'disconnected') : 'disconnected',
                    },
                  })
                }
                placeholder="kwai_token_..."
                className="w-full px-4 py-3 bg-[#0d0e14] border border-zinc-800 focus:border-orange-500 rounded-2xl text-xs text-white placeholder-zinc-600 focus:outline-none font-mono transition"
              />
              <button
                type="button"
                onClick={() => setShowTokens({ ...showTokens, kwai: !showTokens.kwai })}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showTokens.kwai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300">App ID / Client Key (Opcional)</label>
              <input
                type="text"
                value={creds.kwai?.appId || ''}
                onChange={(e) =>
                  setCreds({
                    ...creds,
                    kwai: {
                      ...(creds.kwai || { accessToken: '', status: 'disconnected' as const }),
                      appId: e.target.value,
                    },
                  })
                }
                placeholder="kwai_app_id..."
                className="w-full px-3.5 py-2.5 bg-[#0d0e14] border border-zinc-800 focus:border-orange-500 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none font-mono transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300">App Secret (Opcional)</label>
              <input
                type="password"
                value={creds.kwai?.appSecret || ''}
                onChange={(e) =>
                  setCreds({
                    ...creds,
                    kwai: {
                      ...(creds.kwai || { accessToken: '', status: 'disconnected' as const }),
                      appSecret: e.target.value,
                    },
                  })
                }
                placeholder="••••••••••••••••"
                className="w-full px-3.5 py-2.5 bg-[#0d0e14] border border-zinc-800 focus:border-orange-500 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none font-mono transition"
              />
            </div>
          </div>

          {/* Test Connection Button & Demo Button */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleTestPlatform('kwai')}
              disabled={testingPlatform === 'kwai'}
              className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-orange-950/40 cursor-pointer"
            >
              {testingPlatform === 'kwai' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verificando com o Kwai...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Testar Conexão Kwai</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                const demoKwai = {
                  accessToken: 'kwai-bypass-active',
                  appId: 'kwai_demo_app',
                  appSecret: 'kwai_demo_secret',
                  status: 'connected' as const,
                  accountName: '@kwai_cortes_oficial',
                  verifiedAt: new Date().toLocaleTimeString('pt-BR'),
                };
                const updated = { ...creds, kwai: demoKwai };
                setCreds(updated);
                onSaveCredentials(updated);
                testResults.kwai = {
                  success: true,
                  message: 'Conta Demo Kwai ativada com sucesso!',
                  details: 'Você já pode enviar vídeos e publicar diretamente no Kwai.',
                };
                confetti({ particleCount: 35, spread: 50 });
              }}
              className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            >
              ⚡ Usar Conta Demo Kwai (1 Clique)
            </button>

            <a
              href="https://open.kwai.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-orange-400 hover:text-orange-300 underline inline-flex items-center gap-1 ml-auto"
            >
              Portal Kwai for Developers <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Diagnostic Status Feedback */}
        {testResults.kwai && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              testResults.kwai.success
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                : 'bg-red-950/40 border-red-500/50 text-red-200'
            }`}
          >
            {testResults.kwai.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <p className="font-semibold">{testResults.kwai.message}</p>
              {testResults.kwai.details && <p className="text-[11px] opacity-80">{testResults.kwai.details}</p>}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
