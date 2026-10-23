import React, { useState, useEffect } from 'react';
import { Flame, ShieldCheck, Lock, Zap, Key, UserCheck, AlertCircle } from 'lucide-react';
import { AuthUser } from '../types';
import { fetchJson, setAuthToken } from '../utils/api';

interface GoogleLoginGateProps {
  onLoginSuccess: (user: AuthUser, token: string) => void;
}

export const GoogleLoginGate: React.FC<GoogleLoginGateProps> = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Listen for popup OAuth messages with strict origin checking
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin strictly
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data && event.data.type === 'GOOGLE_AUTH_SUCCESS' && event.data.token) {
        setIsLoading(false);
        setAuthToken(event.data.token);
        onLoginSuccess(event.data.user, event.data.token);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onLoginSuccess]);

  const handleGooglePopupLogin = () => {
    setIsLoading(true);
    setErrorMsg(null);

    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      '/api/auth/google/login',
      'google_auth_window',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,status=no`
    );

    if (!popup) {
      setIsLoading(false);
      setErrorMsg('O popup de login foi bloqueado pelo navegador. Permita popups para continuar.');
      return;
    }

    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setIsLoading(false);
      }
    }, 1000);
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchJson<{ success: boolean; token: string; user: AuthUser; message?: string }>(
        '/api/auth/demo-login',
        { method: 'POST' }
      );

      if (res.ok && res.data.token) {
        setAuthToken(res.data.token);
        onLoginSuccess(res.data.user, res.data.token);
      } else {
        setErrorMsg(res.error || 'Não foi possível iniciar o login demonstrativo.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro de conexão com o servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07080c] text-white flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden select-none">
      {/* Background Neon Glow Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#7000ff]/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#ff0055]/15 rounded-full blur-3xl pointer-events-none animate-pulse delay-1000" />

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-lg bg-[#0e1017]/90 border border-zinc-800/80 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-xl">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative group mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#7000ff] via-[#b000ff] to-[#ff0055] p-[2.5px] shadow-xl shadow-purple-500/30">
              <div className="w-full h-full bg-[#12131a] rounded-[13px] flex items-center justify-center">
                <Flame className="w-9 h-9 text-[#ff0055] animate-pulse" />
              </div>
            </div>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-[#ff0055]"></span>
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
            <span>AI VIRAL SHORTS</span>
            <span className="bg-gradient-to-r from-[#ff0055] to-[#7000ff] bg-clip-text text-transparent">
              CUTTER
            </span>
          </h1>
          <p className="text-sm text-zinc-400 mt-2 max-w-sm">
            Seu Estúdio Autônomo de Mineração de Cortes, Edição com IA e Publicação Automática
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60 text-xs text-zinc-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block">Perfil 100% Isolado</strong>
              Cada usuário possui seus próprios cortes, fila e tokens.
            </div>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60 text-xs text-zinc-300">
            <Lock className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block">Criptografia AES-256</strong>
              Chaves de API guardadas com segurança no servidor.
            </div>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60 text-xs text-zinc-300">
            <Zap className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block">Automação Completa</strong>
              Fila de postagens a cada 5 min no YouTube, Reels e TikTok.
            </div>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60 text-xs text-zinc-300">
            <Key className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block">Auto-Save Contínuo</strong>
              Tokens e configurações salvas na nuvem sem perda de dados.
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3 rounded-xl bg-red-950/40 border border-red-500/40 flex items-center gap-2.5 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Google OAuth Button */}
        <div className="space-y-3 mb-4">
          <button
            type="button"
            onClick={handleGooglePopupLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl font-bold text-sm bg-white text-zinc-900 hover:bg-zinc-100 hover:scale-[1.01] active:scale-[0.99] transition shadow-lg shadow-white/10 disabled:opacity-60 cursor-pointer"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isLoading ? 'Autenticando...' : 'Entrar com o Google'}</span>
          </button>

          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 transition disabled:opacity-60 cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>Entrar como Visitante / Demonstração</span>
          </button>
        </div>

        {/* Footer Notice */}
        <p className="text-[11px] text-zinc-500 text-center mt-5">
          Seus dados de acesso, cortes e configurações são salvos de forma protegida e isolada.
        </p>
      </div>
    </div>
  );
};
