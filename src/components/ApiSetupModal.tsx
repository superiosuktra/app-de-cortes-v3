import React, { useState } from 'react';
import {
  X,
  Youtube,
  Instagram,
  ExternalLink,
  ShieldCheck,
  Key,
  Copy,
  Check,
  HelpCircle,
  Sparkles,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { fetchJson } from '../utils/api';

interface ApiSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedTokens: {
    youtube: string;
    instagram: string;
    tiktok: string;
  };
  onSaveTokens: (tokens: { youtube: string; instagram: string; tiktok: string }) => void;
}

export const ApiSetupModal: React.FC<ApiSetupModalProps> = ({
  isOpen,
  onClose,
  savedTokens,
  onSaveTokens,
}) => {
  const [activePlatform, setActivePlatform] = useState<'youtube' | 'instagram' | 'tiktok'>('youtube');
  const [tokens, setTokens] = useState(savedTokens);
  const [testingStatus, setTestingStatus] = useState<string>('');
  const [testResult, setTestResult] = useState<{
    valid?: boolean;
    accountName?: string;
    avatar?: string;
    details?: string;
    error?: string;
    isAuthCode?: boolean;
    hint?: string;
  } | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleGoogleLoginModal = async () => {
    setTestingStatus('Verificando sessão Google ou abrindo Login...');
    setTestResult(null);
    try {
      const res = await fetchJson<any>('/api/auth/google/quick-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: tokens.youtube || '' }),
      });
      if (res.ok && res.data?.success && res.data?.youtube) {
        const yt = res.data.youtube;
        const newTokens = { ...tokens, youtube: yt.accessToken || tokens.youtube };
        setTokens(newTokens);
        onSaveTokens(newTokens);
        setTestResult({
          valid: true,
          accountName: yt.channelTitle || res.data.accountName || 'Canal do YouTube',
          avatar: yt.avatar || res.data.avatar,
          details: 'Conectado permanentemente via Login do Google (Renovação Automática Ativa)!',
        });
        setTestingStatus('');
        return;
      }
    } catch {}
    setTestingStatus('');
    const width = 540;
    const height = 680;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(
      '/api/auth/google/login',
      'GoogleYouTubeLogin',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=yes,status=no`
    );
  };

  const handleTestToken = async (overrideToken?: string | React.MouseEvent) => {
    const currentToken = typeof overrideToken === 'string' ? overrideToken : tokens[activePlatform];
    if (!currentToken.trim() && activePlatform !== 'youtube') {
      setTestResult({
        valid: false,
        error: `Insira o Access Token do ${activePlatform.toUpperCase()} antes de testar.`,
      });
      return;
    }

    setTestingStatus('Autenticando diretamente na API oficial...');
    setTestResult(null);

    try {
      const res = await fetchJson<any>(`/api/verify-token/${activePlatform}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: currentToken }),
      });
      const data = res.data || {};
      if (res.ok && data.valid) {
        const finalTokens = {
          ...tokens,
          [activePlatform]: data.accessToken || currentToken,
        };
        setTokens(finalTokens);
        setTestResult(data);
        onSaveTokens(finalTokens);
      } else {
        setTestResult({
          valid: false,
          isAuthCode: Boolean(data.isAuthCode),
          error: data.error || res.error || 'Token inválido ou não autorizado.',
          hint: data.hint,
        });
      }
    } catch (e: any) {
      setTestResult({ valid: false, error: e.message || 'Erro ao conectar à API.' });
    } finally {
      setTestingStatus('');
    }
  };

  const handleSaveAndClose = () => {
    onSaveTokens(tokens);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-[#12131d] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between bg-[#161725]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">
                Como Obter e Configurar as APIs Oficiais
              </h3>
              <p className="text-xs text-zinc-400">
                Guia passo a passo para YouTube Shorts, Instagram Reels e TikTok
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Pills */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-zinc-800/60 bg-[#12131d]">
          <button
            onClick={() => {
              setActivePlatform('youtube');
              setTestResult(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition border-b-2 ${
              activePlatform === 'youtube'
                ? 'border-red-500 text-white bg-zinc-800/40'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Youtube className="w-4 h-4 text-red-500" />
            <span>YouTube Data API v3</span>
          </button>

          <button
            onClick={() => {
              setActivePlatform('instagram');
              setTestResult(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition border-b-2 ${
              activePlatform === 'instagram'
                ? 'border-pink-500 text-white bg-zinc-800/40'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Instagram className="w-4 h-4 text-pink-500" />
            <span>Instagram Graph API (Reels)</span>
          </button>

          <button
            onClick={() => {
              setActivePlatform('tiktok');
              setTestResult(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition border-b-2 ${
              activePlatform === 'tiktok'
                ? 'border-cyan-400 text-white bg-zinc-800/40'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="text-cyan-400 font-extrabold text-xs">TT</span>
            <span>TikTok Content Posting API</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* 1. YOUTUBE TAB */}
          {activePlatform === 'youtube' && (
            <div className="space-y-5 animate-fadeIn">
              {/* 1-Click Google Login Box */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#1a1c2e] via-[#1f1930] to-[#261726] border border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <Sparkles className="w-3 h-3 text-emerald-400" /> RECOMENDADO • 1 CLIQUE
                  </span>
                  <h4 className="text-sm font-black text-white">Conectar Canal Fazendo Login com o Google</h4>
                  <p className="text-[11px] text-zinc-300">
                    Entre diretamente com sua conta Google sem precisar configurar chaves manuais.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleLoginModal}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-extrabold text-xs shadow-lg transition shrink-0"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z" />
                    <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z" />
                  </svg>
                  <span>Entrar com o Google</span>
                </button>
              </div>

              {/* One-Click Demo Mode Option */}
              <div className="p-3.5 bg-red-950/30 border border-red-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                    Deseja apenas testar a ferramenta agora?
                  </span>
                  <p className="text-[11px] text-zinc-400">
                    Ative a conexão de demonstração com 1 clique para testar cortes e fila sem Google Cloud.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const demoToken = 'demo_youtube_shorts_verified_token';
                    const newTokens = { ...tokens, youtube: demoToken };
                    setTokens(newTokens);
                    onSaveTokens(newTokens);
                    setTestResult({
                      valid: true,
                      accountName: 'Canal YouTube (Modo Teste/Demo)',
                      avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60',
                      details: 'Modo Demonstração ativado! Pode usar a fila de postagem normalmente.',
                    });
                  }}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-red-600 to-pink-600 hover:opacity-90 text-white text-xs font-bold rounded-lg transition shrink-0"
                >
                  Ativar Teste (1 Clique)
                </button>
              </div>

              {/* Token Input & Test Box */}
              <div className="p-4 bg-[#161726] border border-zinc-700/80 rounded-2xl space-y-3">
                <label className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Ou cole qualquer Link / Código (4/0...) / Token do Google:</span>
                  <span className="text-[10px] text-emerald-400">Troca e Renovação Automáticas</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type={tokens.youtube.startsWith('{') ? 'text' : 'password'}
                    value={tokens.youtube}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      let newVal = e.target.value;
                      if (val.startsWith('{')) {
                        try {
                          const parsed = JSON.parse(val);
                          if (parsed.access_token) newVal = parsed.access_token;
                        } catch (err) {}
                      }
                      setTokens({ ...tokens, youtube: newVal });
                      if (
                        val.includes('code=4/') ||
                        val.startsWith('4/0') ||
                        (val.startsWith('1//') && val.length > 20)
                      ) {
                        handleTestToken(val);
                      }
                    }}
                    placeholder="Cole o link de redirecionamento, código 4/0..., 1//... ou ya29..."
                    className="flex-1 px-3.5 py-2.5 bg-[#0e0f17] border border-zinc-700 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={() => handleTestToken()}
                    disabled={!!testingStatus}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-pink-600 hover:opacity-90 text-white text-xs font-bold transition flex items-center gap-1.5"
                  >
                    {testingStatus ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    <span>Conectar</span>
                  </button>
                </div>

                {/* Real-time Notice if user pasted Authorization Code (4/0...) */}
                {Boolean(
                  tokens.youtube?.trim().startsWith('4/') ||
                  tokens.youtube?.trim().startsWith('4%2F') ||
                  tokens.youtube?.includes('code=')
                ) && (
                  <div className="p-3.5 bg-gradient-to-r from-amber-950/60 to-yellow-950/40 border border-amber-500/50 rounded-xl space-y-2 text-xs text-amber-200 animate-fadeIn">
                    <div className="font-bold flex items-center gap-1.5 text-amber-300">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Você colou o Código de Autorização provisório (começa com 4/)</span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                      Esse código é gerado na etapa 1 do Google. No Google OAuth Playground, falta apenas <strong>1 clique</strong> no Passo 2:
                    </p>
                    <div className="p-2.5 bg-black/60 rounded-lg border border-amber-500/20 text-[11px] text-amber-100 space-y-1">
                      <p>1. Volte na aba do <strong>Google OAuth Playground (Passo 2)</strong>.</p>
                      <p>2. Clique no botão azul: <strong className="text-white underline">[Exchange authorization code for tokens]</strong>.</p>
                      <p>3. O Google preencherá o <strong>Access token (ya29...)</strong> e o <strong>Refresh token (1//...)</strong>. Basta copiar e colar aqui!</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href="https://developers.google.com/oauthplayground"
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] inline-flex items-center gap-1 transition"
                      >
                        Abrir OAuth Playground <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          const demoToken = 'demo_youtube_shorts_verified_token';
                          const newTokens = { ...tokens, youtube: demoToken };
                          setTokens(newTokens);
                          onSaveTokens(newTokens);
                          setTestResult({
                            valid: true,
                            accountName: 'Canal YouTube (Modo Teste/Demo)',
                            avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60',
                            details: 'Modo Demonstração ativado! Pode usar a fila de postagem normalmente.',
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] inline-flex items-center gap-1 transition shadow"
                      >
                        <Sparkles className="w-3 h-3 text-yellow-300" />
                        Conectar Canal de Teste (1 Clique)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. INSTAGRAM TAB */}
          {activePlatform === 'instagram' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 bg-pink-950/20 border border-pink-500/20 rounded-2xl flex items-start gap-3">
                <Instagram className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-300 leading-relaxed space-y-1">
                  <p className="font-bold text-white">Sobre a Meta Graph API (Instagram Reels):</p>
                  <p>
                    A Meta permite publicação automática de Reels através da <strong>Instagram Content Publishing API</strong> para contas <em>Profissionais</em> (Criador ou Comercial) vinculadas a uma Página do Facebook.
                  </p>
                </div>
              </div>

              {/* Step by step */}
              <div className="space-y-3 text-xs text-zinc-300">
                <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                  Passo a Passo:
                </h4>

                <div className="p-3 bg-[#0d0e15] border border-zinc-800 rounded-xl space-y-1">
                  <span className="font-bold text-pink-400">1. Criar App no Meta for Developers:</span>
                  <p>
                    Acesse <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-purple-400 underline inline-flex items-center gap-1">developers.facebook.com <ExternalLink className="w-3 h-3" /></a> e crie um App do tipo <strong>Empresa / Business</strong>.
                  </p>
                </div>

                <div className="p-3 bg-[#0d0e15] border border-zinc-800 rounded-xl space-y-2">
                  <span className="font-bold text-pink-400">2. Permissões Necessárias (Scopes):</span>
                  <p>No <strong>Graph API Explorer</strong>, adicione as permissões:</p>
                  <div className="p-2 bg-black rounded-lg font-mono text-[11px] text-yellow-300 flex flex-wrap gap-2">
                    <span className="px-1.5 py-0.5 bg-zinc-900 rounded">instagram_content_publish</span>
                    <span className="px-1.5 py-0.5 bg-zinc-900 rounded">instagram_basic</span>
                    <span className="px-1.5 py-0.5 bg-zinc-900 rounded">pages_show_list</span>
                  </div>
                </div>

                <div className="p-3 bg-[#0d0e15] border border-zinc-800 rounded-xl space-y-1">
                  <span className="font-bold text-pink-400">3. Gerar Token de Longa Duração (60 dias):</span>
                  <p>
                    Converta seu User Token em um <em>Page Access Token de Longa Duração</em> no Gerenciador de Acesso para não expirar a cada hora.
                  </p>
                </div>
              </div>

              {/* Token Input & Test Box */}
              <div className="p-4 bg-[#161726] border border-zinc-700/80 rounded-2xl space-y-3">
                <label className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Cole seu Access Token da Meta (Instagram Reels):</span>
                  <span className="text-[10px] text-zinc-400">User ou Page Token</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={tokens.instagram}
                    onChange={(e) => setTokens({ ...tokens, instagram: e.target.value })}
                    placeholder="EAA..."
                    className="flex-1 px-3.5 py-2.5 bg-[#0e0f17] border border-zinc-700 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleTestToken}
                    disabled={!!testingStatus}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 text-white text-xs font-bold transition flex items-center gap-1.5"
                  >
                    {testingStatus ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    <span>Testar Conexão</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. TIKTOK TAB */}
          {activePlatform === 'tiktok' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 bg-cyan-950/20 border border-cyan-500/20 rounded-2xl flex items-start gap-3">
                <span className="text-cyan-400 font-black text-sm">TT</span>
                <div className="text-xs text-zinc-300 leading-relaxed space-y-1">
                  <p className="font-bold text-white">Sobre a TikTok Content Posting API:</p>
                  <p>
                    O TikTok disponibiliza a <strong>Content Posting API (Direct Post)</strong> para aplicativos registrados no portal de desenvolvedores.
                  </p>
                </div>
              </div>

              {/* Step by step */}
              <div className="space-y-3 text-xs text-zinc-300">
                <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                  Passo a Passo:
                </h4>

                <div className="p-3 bg-[#0d0e15] border border-zinc-800 rounded-xl space-y-1">
                  <span className="font-bold text-cyan-400">1. Cadastrar no TikTok for Developers:</span>
                  <p>
                    Acesse <a href="https://developers.tiktok.com" target="_blank" rel="noreferrer" className="text-purple-400 underline inline-flex items-center gap-1">developers.tiktok.com <ExternalLink className="w-3 h-3" /></a> e crie uma conta de desenvolvedor.
                  </p>
                </div>

                <div className="p-3 bg-[#0d0e15] border border-zinc-800 rounded-xl space-y-2">
                  <span className="font-bold text-cyan-400">2. Solicitar o Produto Content Posting API:</span>
                  <p>Adicione o produto <strong>Content Posting API</strong> com os seguintes escopos de autorização:</p>
                  <div className="p-2 bg-black rounded-lg font-mono text-[11px] text-yellow-300 flex flex-wrap gap-2">
                    <span className="px-1.5 py-0.5 bg-zinc-900 rounded">video.upload</span>
                    <span className="px-1.5 py-0.5 bg-zinc-900 rounded">video.publish</span>
                    <span className="px-1.5 py-0.5 bg-zinc-900 rounded">user.info.basic</span>
                  </div>
                </div>
              </div>

              {/* Token Input & Test Box */}
              <div className="p-4 bg-[#161726] border border-zinc-700/80 rounded-2xl space-y-3">
                <label className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Cole seu Access Token do TikTok:</span>
                  <span className="text-[10px] text-zinc-400">Bearer Token</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={tokens.tiktok}
                    onChange={(e) => setTokens({ ...tokens, tiktok: e.target.value })}
                    placeholder="act.example123..."
                    className="flex-1 px-3.5 py-2.5 bg-[#0e0f17] border border-zinc-700 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleTestToken}
                    disabled={!!testingStatus}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-90 text-white text-xs font-bold transition flex items-center gap-1.5"
                  >
                    {testingStatus ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    <span>Testar Conexão</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Test Status & Feedback Box */}
          {testResult && (
            <div
              className={`p-4 rounded-2xl border flex items-start gap-3 text-xs ${
                testResult.valid
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : 'bg-red-950/40 border-red-500/50 text-red-200'
              }`}
            >
              {testResult.valid ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-2 flex-1">
                <p className="font-bold text-sm">
                  {testResult.valid
                    ? `🎉 Conexão Válida: ${testResult.accountName}`
                    : 'Falha na Validação do Token'}
                </p>
                <p className="leading-relaxed">{testResult.details || testResult.error}</p>

                {/* Specific Help for Authorization Code */}
                {testResult.isAuthCode && (
                  <div className="mt-3 p-3 bg-black/60 rounded-xl border border-red-500/30 space-y-2 text-zinc-200">
                    <div className="font-semibold text-yellow-300 flex items-center gap-1.5 text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                      Como resolver em 10 segundos:
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-300">
                      <li>Volte na página do <strong>Google OAuth Playground (Passo 2)</strong>.</li>
                      <li>Clique no botão azul destacado: <strong>[ Exchange authorization code for tokens ]</strong>.</li>
                      <li>O Google vai gerar o <strong>Refresh token (1//...)</strong> e o <strong>Access token (ya29...)</strong>.</li>
                      <li>Copie o <strong>ya29...</strong> ou o <strong>1//...</strong> e cole aqui!</li>
                    </ol>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href="https://developers.google.com/oauthplayground"
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] inline-flex items-center gap-1 transition"
                      >
                        Abrir OAuth Playground <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          const demoToken = 'demo_youtube_shorts_verified_token';
                          const newTokens = { ...tokens, youtube: demoToken };
                          setTokens(newTokens);
                          onSaveTokens(newTokens);
                          setTestResult({
                            valid: true,
                            accountName: 'Canal YouTube (Modo Teste/Demo)',
                            avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60',
                            details: 'Modo Demonstração ativado! Pode usar a fila de postagem normalmente.',
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] inline-flex items-center gap-1 transition shadow"
                      >
                        <Sparkles className="w-3 h-3 text-yellow-300" />
                        Conectar Canal de Teste (1 Clique)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-[#161725] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>🔒 Armazenamento Permanente: Configura apenas 1 vez. Fica salvo no navegador e na fila automática!</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveAndClose}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white text-xs font-bold transition shadow-lg shadow-purple-900/30"
            >
              Salvar Credenciais
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
