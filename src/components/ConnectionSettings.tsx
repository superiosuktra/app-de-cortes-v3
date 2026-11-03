import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Download,
  Upload,
  Check,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import { PlatformCredentials, AiProviderConfig } from '../types';
import { TikTokReviewGuideModal } from './TikTokReviewGuideModal';
import { LegalPagesModal } from './LegalPagesModal';
import { fetchJson, authFetch } from '../utils/api';
import confetti from 'canvas-confetti';
import { PWAInstallButton } from './PWAInstallButton';
import { CloudCheck } from 'lucide-react';
import { AiProviderSettingsCard } from './settings/AiProviderSettingsCard';
import { YouTubeSettingsCard } from './settings/YouTubeSettingsCard';
import { SocialPlatformsSettingsCard } from './settings/SocialPlatformsSettingsCard';
import { WebhookSettingsCard } from './settings/WebhookSettingsCard';

interface ConnectionSettingsProps {
  credentials: PlatformCredentials;
  onSaveCredentials: (newCreds: PlatformCredentials) => void;
  onNavigateToTab?: (tab: 'trending' | 'analyze' | 'editor' | 'publish') => void;
}

const DEFAULT_CREDS: PlatformCredentials = {
  youtube: {
    accessToken: '',
    clientId: '',
    clientSecret: '',
    status: 'disconnected',
  },
  instagram: {
    accessToken: '',
    businessAccountId: '',
    appId: '',
    appSecret: '',
    status: 'disconnected',
  },
  tiktok: {
    accessToken: '',
    clientKey: '',
    clientSecret: '',
    status: 'disconnected',
  },
  kwai: {
    accessToken: '',
    appId: '',
    appSecret: '',
    status: 'disconnected',
  },
  aiConfig: {
    provider: 'gemini',
    ollamaEndpoint: 'http://localhost:11434',
    ollamaModel: 'llama3:8b',
    activeModel: 'gemini-3.8-flash',
    status: 'connected',
    latencyMs: 0,
  },
};

export const ConnectionSettings: React.FC<ConnectionSettingsProps> = ({
  credentials,
  onSaveCredentials,
  onNavigateToTab,
}) => {
  const [creds, setCreds] = useState<PlatformCredentials>(credentials || DEFAULT_CREDS);
  const [showTokens, setShowTokens] = useState<{ [key: string]: boolean }>({
    youtube: false,
    instagram: false,
    tiktok: false,
    kwai: false,
  });
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{
    [key: string]: {
      success: boolean;
      message: string;
      details?: any;
      isAuthCode?: boolean;
      hint?: string;
    };
  }>({});
  const [copiedScope, setCopiedScope] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string>('');
  const [isTikTokGuideOpen, setIsTikTokGuideOpen] = useState<boolean>(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState<boolean>(false);
  const [legalModalTab, setLegalModalTab] = useState<'privacy' | 'terms' | 'hosting'>('privacy');
  const [isGooglePopupOpen, setIsGooglePopupOpen] = useState<boolean>(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState<boolean>(false);
  const [googleQuickPasteInput, setGoogleQuickPasteInput] = useState<string>('');
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [geminiStatus, setGeminiStatus] = useState<{ configured: boolean; model: string; testing: boolean; message?: string }>({
    configured: false,
    model: 'gemini-3.8-flash',
    testing: false,
  });

  const [aiConfig, setAiConfig] = useState<AiProviderConfig>(
    creds.aiConfig || {
      provider: 'gemini',
      ollamaEndpoint: 'http://localhost:11434',
      ollamaModel: 'llama3:8b',
      activeModel: 'gemini-3.8-flash',
      status: 'connected',
      latencyMs: 0,
    }
  );
  const [isTestingLocalAi, setIsTestingLocalAi] = useState<boolean>(false);
  const [localAiFeedback, setLocalAiFeedback] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    models?: string[];
  } | null>(null);

  useEffect(() => {
    authFetch('/api/gemini/status')
      .then((r) => r.json())
      .then((res) => {
        setGeminiStatus((prev) => ({
          ...prev,
          configured: Boolean(res.configured),
          model: res.model || 'gemini-3.8-flash',
        }));
        if (res.aiConfig) {
          setAiConfig((prev) => ({ ...prev, ...res.aiConfig }));
        }
      })
      .catch(() => {});
  }, []);

  const handleTestLocalAi = async () => {
    setIsTestingLocalAi(true);
    setLocalAiFeedback(null);
    try {
      const res = await authFetch('/api/ai/test-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: aiConfig.ollamaEndpoint || 'http://localhost:11434',
          model: aiConfig.ollamaModel || 'llama3:8b',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLocalAiFeedback({
          success: true,
          message: data.message || `Conectado com sucesso (${data.latencyMs}ms)!`,
          latencyMs: data.latencyMs,
          models: data.models,
        });
        const updatedAi: AiProviderConfig = {
          ...aiConfig,
          status: 'connected',
          latencyMs: data.latencyMs,
        };
        setAiConfig(updatedAi);
        const updatedCreds = { ...creds, aiConfig: updatedAi };
        setCreds(updatedCreds);
        onSaveCredentials(updatedCreds);
        confetti({ particleCount: 35, spread: 60 });
      } else {
        setLocalAiFeedback({
          success: false,
          message: data.error || 'Falha ao conectar no Ollama.',
          latencyMs: data.latencyMs,
        });
      }
    } catch (err: any) {
      setLocalAiFeedback({
        success: false,
        message: err.message || 'Erro de conexão.',
      });
    } finally {
      setIsTestingLocalAi(false);
    }
  };

  const handleVerifyGemini = async () => {
    setGeminiStatus((prev) => ({ ...prev, testing: true, message: '' }));
    try {
      const res = await fetchJson<any>('/api/gemini/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: geminiApiKey }),
      });
      if (res.ok && res.data?.valid) {
        setGeminiStatus({
          configured: true,
          model: res.data.model || 'gemini-3.8-flash',
          testing: false,
          message: '✅ Conectado com sucesso ao seu Google AI Studio!',
        });
        confetti({ particleCount: 40, spread: 60 });
      } else {
        setGeminiStatus((prev) => ({
          ...prev,
          testing: false,
          message: `❌ ${res.data?.error || 'Chave inválida.'}`,
        }));
      }
    } catch (err: any) {
      setGeminiStatus((prev) => ({
        ...prev,
        testing: false,
        message: `❌ ${err.message}`,
      }));
    }
  };

  const [discordWebhookUrl, setDiscordWebhookUrl] = useState<string>(creds.webhooks?.discordWebhookUrl || '');
  const [telegramBotToken, setTelegramBotToken] = useState<string>(creds.webhooks?.telegramBotToken || '');
  const [telegramChatId, setTelegramChatId] = useState<string>(creds.webhooks?.telegramChatId || '');
  const [isTestingWebhook, setIsTestingWebhook] = useState<boolean>(false);
  const [webhookFeedback, setWebhookFeedback] = useState<string>('');

  const handleTestWebhook = async () => {
    setIsTestingWebhook(true);
    setWebhookFeedback('');
    try {
      const res = await authFetch('/api/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordWebhookUrl,
          telegramBotToken,
          telegramChatId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWebhookFeedback(data.message || '✅ Notificação enviada com sucesso!');
        confetti({ particleCount: 35, spread: 50 });
      } else {
        setWebhookFeedback(`⚠️ ${data.error || data.message || 'Falha ao disparar webhook'}`);
      }
    } catch (err: any) {
      setWebhookFeedback(`❌ Erro: ${err.message}`);
    } finally {
      setIsTestingWebhook(false);
    }
  };

  useEffect(() => {
    if (credentials) {
      setCreds(credentials);
      if (credentials.webhooks) {
        if (credentials.webhooks.discordWebhookUrl !== undefined) setDiscordWebhookUrl(credentials.webhooks.discordWebhookUrl);
        if (credentials.webhooks.telegramBotToken !== undefined) setTelegramBotToken(credentials.webhooks.telegramBotToken);
        if (credentials.webhooks.telegramChatId !== undefined) setTelegramChatId(credentials.webhooks.telegramChatId);
      }
    }
  }, [credentials]);

  // Listen for postMessage from /api/auth/google/callback popup with strict origin check
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (event.data && event.data.type === 'GOOGLE_OAUTH_SUCCESS') {
        setIsGooglePopupOpen(false);
        setIsConnectingGoogle(false);
        authFetch('/api/settings/credentials')
          .then((r) => r.json())
          .then((res) => {
            if (res.credentials) {
              setCreds((prev) => ({ ...prev, ...res.credentials }));
            }
          })
          .catch(() => {});
        setSaveFeedback('✅ Canal vinculado via Login do Google com sucesso!');
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Quick-connect using code, redirect URL, refresh token, or existing server session
  const handleGoogleQuickConnect = async (rawInput?: string, openPopupIfNeeded = false) => {
    setIsConnectingGoogle(true);
    try {
      const res = await fetchJson<any>('/api/auth/google/quick-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: rawInput || '' }),
      });

      if (res.ok && res.data?.success && res.data?.youtube) {
        const yt = res.data.youtube;
        const updated = {
          ...creds,
          youtube: {
            ...creds.youtube,
            ...yt,
            status: 'connected' as const,
          },
        };
        setCreds(updated);
        onSaveCredentials(updated);
        setIsGooglePopupOpen(false);
        setGoogleQuickPasteInput('');
        setSaveFeedback(`✅ ${res.data.message || 'Canal conectado com sucesso!'}`);
        setTestResults((prev) => ({
          ...prev,
          youtube: {
            success: true,
            message: `Conectado via Google: ${yt.channelTitle || res.data.accountName || 'Canal Ativo'}!`,
            details: 'Sessão permanente ativa — o aplicativo renova o token sozinho em segundo plano.',
          },
        }));
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
        setTimeout(() => setSaveFeedback(''), 5000);
        return true;
      }

      if (openPopupIfNeeded) {
        openGoogleAuthPopup();
      } else if (rawInput) {
        setSaveFeedback(`⚠️ ${res.data?.error || 'Código inválido ou expirado.'}`);
      }
      return false;
    } catch {
      if (openPopupIfNeeded) openGoogleAuthPopup();
      return false;
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const openGoogleAuthPopup = () => {
    const width = 540;
    const height = 680;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const params = new URLSearchParams();
    params.set('youtubeOAuth', '1');
    if (creds.youtube.clientId) params.set('clientId', creds.youtube.clientId);
    if (creds.youtube.clientSecret) params.set('clientSecret', creds.youtube.clientSecret);

    window.open(
      `/api/auth/google/login?${params.toString()}`,
      'GoogleYouTubeLogin',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=yes,status=no`
    );
    setIsGooglePopupOpen(true);
  };

  useEffect(() => {
    if (!isGooglePopupOpen) return;
    const handleFocus = async () => {
      try {
        const clipText = (await navigator.clipboard.readText())?.trim() || '';
        if (
          clipText.includes('code=4/') ||
          clipText.includes('code=4%2F') ||
          clipText.startsWith('4/0') ||
          clipText.startsWith('1//0') ||
          clipText.startsWith('ya29.')
        ) {
          await handleGoogleQuickConnect(clipText, false);
        }
      } catch {
        // Clipboard permission not granted yet
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isGooglePopupOpen]);

  const handleCopyScope = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScope(text);
    setTimeout(() => setCopiedScope(null), 2000);
  };

  const handleTestPlatform = async (platform: 'youtube' | 'instagram' | 'tiktok' | 'kwai') => {
    const token = creds[platform]?.accessToken;
    const refreshToken = (creds[platform] as any)?.refreshToken;
    if (!token?.trim() && !(platform === 'youtube' && refreshToken?.trim())) {
      setTestResults((prev) => ({
        ...prev,
        [platform]: {
          success: false,
          message: 'Clique em "Entrar com o Google" ou insira o token antes de testar.',
        },
      }));
      return;
    }

    setTestingPlatform(platform);
    try {
      const res = await fetchJson<any>(`/api/verify-token/${platform}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: (token || '').trim(),
          refreshToken,
          clientId: (creds[platform] as any).clientId,
          clientSecret: (creds[platform] as any).clientSecret || (creds[platform] as any).appSecret,
        }),
      });

      const data = res.data || {};

      if (res.ok && data.valid) {
        const platformUpdate: any = {
          ...(creds[platform] || {}),
          accessToken: data.accessToken || creds[platform]?.accessToken || '',
          status: 'connected' as const,
          avatar: data.avatar || (creds[platform] as any)?.avatar,
          verifiedAt: new Date().toLocaleTimeString('pt-BR'),
        };

        if (platform === 'youtube') {
          platformUpdate.channelTitle = data.accountName || creds.youtube?.channelTitle;
          if (data.refreshToken) platformUpdate.refreshToken = data.refreshToken;
          if (data.customUrl) platformUpdate.customUrl = data.customUrl;
        } else if (platform === 'instagram') {
          platformUpdate.accountName = data.accountName || creds.instagram?.accountName;
        } else if (platform === 'tiktok') {
          platformUpdate.displayName = data.accountName || creds.tiktok?.displayName;
        } else if (platform === 'kwai') {
          platformUpdate.accountName = data.accountName || creds.kwai?.accountName || '@kwai_criador';
        }

        const updated = {
          ...creds,
          [platform]: platformUpdate,
        };
        setCreds(updated);
        onSaveCredentials(updated);

        setTestResults((prev) => ({
          ...prev,
          [platform]: {
            success: true,
            message: `Conectado com sucesso: ${data.accountName || 'Conta Ativa'}!`,
            details: data.details,
          },
        }));
        confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
      } else {
        const updated = {
          ...creds,
          [platform]: {
            ...(creds[platform] || {}),
            status: 'error' as const,
          },
        };
        setCreds(updated);
        onSaveCredentials(updated);

        setTestResults((prev) => ({
          ...prev,
          [platform]: {
            success: false,
            message: data.error || res.error || 'Token inválido ou expirado.',
            isAuthCode: Boolean(data.isAuthCode),
            hint: data.hint,
          },
        }));
      }
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [platform]: {
          success: false,
          message: `Erro na requisição: ${e.message}`,
        },
      }));
    } finally {
      setTestingPlatform(null);
    }
  };

  const handleTestAll = async () => {
    await Promise.all([
      creds.youtube.accessToken ? handleTestPlatform('youtube') : null,
      creds.instagram.accessToken ? handleTestPlatform('instagram') : null,
      creds.tiktok.accessToken ? handleTestPlatform('tiktok') : null,
      creds.kwai?.accessToken ? handleTestPlatform('kwai') : null,
    ]);
  };

  const handleDisconnect = (platform: 'youtube' | 'instagram' | 'tiktok' | 'kwai') => {
    const updated = {
      ...creds,
      [platform]: {
        accessToken: '',
        clientId: '',
        clientSecret: '',
        status: 'disconnected' as const,
        channelTitle: '',
        accountName: '',
        displayName: '',
        avatar: '',
        verifiedAt: '',
      },
    };
    setCreds(updated);
    onSaveCredentials(updated);
    setTestResults((prev) => ({
      ...prev,
      [platform]: {
        success: false,
        message: 'Credencial desconectada e limpa.',
      },
    }));
  };

  const handleActivateDemoYouTube = () => {
    const demoToken = 'demo_youtube_shorts_verified_token';
    const updated = {
      ...creds,
      youtube: {
        accessToken: demoToken,
        clientId: 'demo-client-id.apps.googleusercontent.com',
        clientSecret: 'demo-client-secret',
        status: 'connected' as const,
        channelTitle: 'Canal YouTube (Modo Demonstração)',
        accountName: '@canal.demonstracao',
        avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60',
        verifiedAt: new Date().toLocaleTimeString('pt-BR'),
      },
    };
    setCreds(updated);
    onSaveCredentials(updated);
    setTestResults((prev) => ({
      ...prev,
      youtube: {
        success: true,
        message: 'Modo Demonstração do YouTube ativado com sucesso!',
        details: 'Você já pode testar toda a fila de postagem e os fluxos de Shorts sem configurar chaves no Google Cloud.',
      },
    }));
    setSaveFeedback('✅ Modo Demonstração do YouTube ativado!');
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
    setTimeout(() => setSaveFeedback(''), 3500);
  };

  const handleSaveAll = () => {
    const updated = {
      ...creds,
      aiConfig,
      webhooks: {
        discordWebhookUrl,
        telegramBotToken,
        telegramChatId,
      },
    };
    setCreds(updated);
    onSaveCredentials(updated);
    setSaveFeedback('✅ Todas as credenciais, IA e webhooks foram salvos e sincronizados com sucesso!');
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
    setTimeout(() => setSaveFeedback(''), 3500);
  };

  const handleExportBackup = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(creds, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `viral_shorts_credentials_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (imported.youtube || imported.instagram || imported.tiktok) {
          const merged = { ...creds, ...imported };
          setCreds(merged);
          onSaveCredentials(merged);
          setSaveFeedback('✅ Backup de credenciais restaurado com sucesso!');
          setTimeout(() => setSaveFeedback(''), 3500);
        }
      } catch {
        setSaveFeedback('❌ Arquivo de backup JSON inválido.');
        setTimeout(() => setSaveFeedback(''), 3500);
      }
    };
    reader.readAsText(file);
  };

  const connectedCount = [
    creds.youtube?.status === 'connected',
    creds.instagram?.status === 'connected',
    creds.tiktok?.status === 'connected',
    creds.kwai?.status === 'connected',
  ].filter(Boolean).length;

  return (
    <div className="space-y-6 animate-fadeIn max-w-5xl mx-auto">
      {/* Sleek Top Navigation Return Bar */}
      {onNavigateToTab && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#12131b] border border-zinc-800 rounded-2xl shadow-sm">
          <button
            onClick={() => onNavigateToTab('publish')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700/80 text-xs font-bold transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-purple-400" />
            <span>← Voltar para Publicação & Fila</span>
          </button>

          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <button
              onClick={() => onNavigateToTab('editor')}
              className="hover:text-purple-300 transition underline underline-offset-4 cursor-pointer"
            >
              Ir ao Editor 9:16
            </button>
            <span>•</span>
            <button
              onClick={() => onNavigateToTab('analyze')}
              className="hover:text-pink-300 transition underline underline-offset-4 cursor-pointer"
            >
              Detecção IA
            </button>
          </div>
        </div>
      )}

      {/* Top Banner Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#141226] via-[#1a142e] to-[#251433] border border-purple-900/40 p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-fuchsia-500/10 border border-fuchsia-500/30 text-pink-300 mb-3">
              <ShieldCheck className="w-3.5 h-3.5 text-pink-400" />
              Central de Credenciais & APIs Oficiais
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Configurações de Conexão das Plataformas
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 mt-1 max-w-2xl">
              Insira e gerencie as credenciais OAuth e Access Tokens oficiais do YouTube, Instagram e TikTok. Os tokens são salvos com segurança no seu navegador e sincronizados com o backend para publicações automáticas de Shorts e Reels.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="px-3.5 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-700/80 flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${connectedCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
              <span className="text-xs font-bold text-white font-mono">
                {connectedCount} de 3 Conectadas
              </span>
            </div>

            <button
              onClick={handleTestAll}
              disabled={!!testingPlatform}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white text-xs font-bold transition shadow-md shadow-pink-900/30 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingPlatform ? 'animate-spin' : ''}`} />
              <span>Testar Todas</span>
            </button>
          </div>
        </div>
      </div>

      {/* PWA Desktop Install Banner */}
      <PWAInstallButton variant="banner" />

      {/* Auto-Save & Zero-Backup Reassurance Box */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <CloudCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              Salvamento Automático Permanente Ativo
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Backup Manual Desnecessário
              </span>
            </h4>
            <p className="text-[11px] text-zinc-300 mt-0.5">
              Todas as suas credenciais, chaves de API, cortes favoritados e fila de postagem são gravados de forma redundante e contínua no navegador e no disco do servidor. Você não precisa se preocupar em salvar cópias de backup manualmente.
            </p>
          </div>
        </div>
      </div>

      {/* Global Actions Bar: Save, Export, Import */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#141520] border border-zinc-800 rounded-2xl">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#7000ff] to-[#ff0055] text-white text-xs font-extrabold shadow-lg shadow-purple-900/30 hover:scale-[1.01] active:scale-[0.99] transition cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Salvar Todas as Configurações</span>
          </button>

          {saveFeedback && (
            <span className="text-xs text-emerald-400 font-semibold animate-fadeIn">
              {saveFeedback}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            title="Exportar arquivo JSON com as credenciais salvas"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span>Exportar Backup</span>
          </button>

          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 hover:text-white text-xs font-semibold transition cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-pink-400" />
            <span>Importar Backup</span>
            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          </label>
        </div>
      </div>

      {/* Platform Cards Grid */}
      <div className="space-y-6">
        <AiProviderSettingsCard
          aiConfig={aiConfig}
          setAiConfig={setAiConfig}
          creds={creds}
          setCreds={setCreds}
          onSaveCredentials={onSaveCredentials}
          geminiApiKey={geminiApiKey}
          setGeminiApiKey={setGeminiApiKey}
          geminiStatus={{
            configured: geminiStatus.configured,
            model: geminiStatus.model,
            testing: geminiStatus.testing,
            message: geminiStatus.message || '',
          }}
          handleVerifyGemini={handleVerifyGemini}
          isTestingLocalAi={isTestingLocalAi}
          handleTestLocalAi={handleTestLocalAi}
          localAiFeedback={localAiFeedback}
        />

        <YouTubeSettingsCard
          creds={creds}
          setCreds={setCreds}
          onSaveCredentials={onSaveCredentials}
          showTokens={showTokens}
          setShowTokens={setShowTokens}
          handleDisconnect={handleDisconnect}
          handleTestPlatform={handleTestPlatform}
          testingPlatform={testingPlatform}
          testResults={testResults}
          handleActivateDemoYouTube={handleActivateDemoYouTube}
          copiedScope={copiedScope}
          handleCopyScope={handleCopyScope}
          isConnectingGoogle={isConnectingGoogle}
          handleGoogleQuickConnect={handleGoogleQuickConnect}
          isGooglePopupOpen={isGooglePopupOpen}
          setIsGooglePopupOpen={setIsGooglePopupOpen}
          openGoogleAuthPopup={openGoogleAuthPopup}
          googleQuickPasteInput={googleQuickPasteInput}
          setGoogleQuickPasteInput={setGoogleQuickPasteInput}
          onNavigateToTab={onNavigateToTab}
        />

        <SocialPlatformsSettingsCard
          creds={creds}
          setCreds={setCreds}
          onSaveCredentials={onSaveCredentials}
          showTokens={showTokens}
          setShowTokens={setShowTokens}
          handleDisconnect={handleDisconnect}
          handleTestPlatform={handleTestPlatform}
          testingPlatform={testingPlatform}
          testResults={testResults}
          setIsTikTokGuideOpen={setIsTikTokGuideOpen}
        />

        <WebhookSettingsCard
          discordWebhookUrl={discordWebhookUrl}
          setDiscordWebhookUrl={setDiscordWebhookUrl}
          telegramBotToken={telegramBotToken}
          setTelegramBotToken={setTelegramBotToken}
          telegramChatId={telegramChatId}
          setTelegramChatId={setTelegramChatId}
          handleTestWebhook={handleTestWebhook}
          isTestingWebhook={isTestingWebhook}
          webhookFeedback={webhookFeedback}
        />
      </div>

      {/* Footer Navigation Back to Publishing */}
      {onNavigateToTab && (
        <div className="pt-4 flex justify-end">
          <button
            onClick={() => onNavigateToTab('publish')}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#7000ff] to-[#ff0055] text-white text-xs font-bold shadow-lg shadow-purple-900/30 hover:opacity-95 transition cursor-pointer"
          >
            <span>Voltar para Central de Publicação</span>
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modais de Ajuda Legal e Revisão do TikTok */}
      <TikTokReviewGuideModal
        isOpen={isTikTokGuideOpen}
        onClose={() => setIsTikTokGuideOpen(false)}
        onOpenLegalModal={(tab) => {
          setLegalModalTab(tab);
          setIsLegalModalOpen(true);
        }}
      />

      <LegalPagesModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
        defaultTab={legalModalTab}
      />
    </div>
  );
};
