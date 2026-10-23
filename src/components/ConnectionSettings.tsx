import React, { useState, useEffect } from 'react';
import {
  Key,
  ShieldCheck,
  Youtube,
  Instagram,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Trash2,
  Download,
  Upload,
  CheckCircle2,
  Lock,
  Sparkles,
  HelpCircle,
  Copy,
  Bell,
  Send,
  ArrowLeft,
} from 'lucide-react';
import { PlatformCredentials, AiProviderConfig } from '../types';
import { TikTokReviewGuideModal } from './TikTokReviewGuideModal';
import { LegalPagesModal } from './LegalPagesModal';
import { fetchJson, authFetch } from '../utils/api';
import confetti from 'canvas-confetti';
import { PWAInstallButton } from './PWAInstallButton';
import { CloudCheck, Laptop, Cpu, Server, Activity } from 'lucide-react';

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

  // Listen for postMessage from /api/auth/google/callback popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'GOOGLE_OAUTH_SUCCESS') {
        setIsGooglePopupOpen(false);
        setIsConnectingGoogle(false);
        if (event.data.success && event.data.youtube) {
          const updated = {
            ...creds,
            youtube: {
              ...creds.youtube,
              ...event.data.youtube,
              status: 'connected' as const,
            },
          };
          setCreds(updated);
          onSaveCredentials(updated);
          setSaveFeedback(`✅ ${event.data.message || 'Canal conectado via Login do Google!'}`);
          setTestResults((prev) => ({
            ...prev,
            youtube: {
              success: true,
              message: `Conectado com sucesso: ${event.data.youtube.channelTitle || 'Canal do YouTube'}!`,
              details: 'Autenticação Google OAuth 2.0 concluída com Renovação Automática Permanente.',
            },
          }));
          confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [creds, onSaveCredentials]);

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

  // Auto-detect Google Auth Code or Token from clipboard when user returns from the Google login popup
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
        // Clipboard permission not granted yet; user can click the 1-click button or paste
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isGooglePopupOpen]);

  const toggleShowToken = (platform: string) => {
    setShowTokens((prev) => ({ ...prev, [platform]: !prev[platform] }));
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScope(id);
    setTimeout(() => setCopiedScope(null), 2000);
  };

  // Test individual platform token
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
        let platformUpdate: any = {
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

  // Test all platforms simultaneously
  const handleTestAll = async () => {
    await Promise.all([
      creds.youtube.accessToken ? handleTestPlatform('youtube') : null,
      creds.instagram.accessToken ? handleTestPlatform('instagram') : null,
      creds.tiktok.accessToken ? handleTestPlatform('tiktok') : null,
      creds.kwai?.accessToken ? handleTestPlatform('kwai') : null,
    ]);
  };

  // Disconnect/clear platform
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

  // Export JSON backup
  const handleExportBackup = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(creds, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `viral_shorts_credentials_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import JSON backup
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
      } catch (err) {
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white text-xs font-bold transition shadow-md shadow-pink-900/30"
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
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#7000ff] to-[#ff0055] text-white text-xs font-extrabold shadow-lg shadow-purple-900/30 hover:scale-[1.01] active:scale-[0.99] transition"
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
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-300 hover:text-white text-xs font-semibold transition"
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

        {/* ============================================================ */}
        {/* 0. MOTOR DE INTELIGÊNCIA ARTIFICIAL: NUVEM VS LOCAL (OLLAMA) */}
        {/* ============================================================ */}
        <div className="bg-[#141520] border border-zinc-800 hover:border-cyan-500/40 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-cyan-600/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-md">
                <Cpu className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-white">Motor de Inteligência Artificial</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    aiConfig.provider === 'ollama'
                      ? 'bg-purple-950/80 border border-purple-500/40 text-purple-300'
                      : 'bg-cyan-950/80 border border-cyan-500/40 text-cyan-300'
                  }`}>
                    {aiConfig.provider === 'ollama' ? '100% Local (Ollama)' : 'Google Gemini Cloud'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Alterne entre APIs em nuvem e modelos locais (Llama 3, DeepSeek R1) para redução de custos
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 ${
                  aiConfig.provider === 'ollama'
                    ? (localAiFeedback?.success || aiConfig.status === 'connected'
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50')
                    : (geminiStatus.configured
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50')
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {aiConfig.provider === 'ollama'
                    ? (aiConfig.latencyMs ? `Local Ativo (${aiConfig.latencyMs}ms)` : 'Ollama Ativo')
                    : (geminiStatus.configured ? 'Gemini Conectado' : 'Chave Ativa')}
                </span>
              </span>
            </div>
          </div>

          {/* Provider Selection Tabs */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
              <span>Selecione o Provedor de IA:</span>
              <span className="text-[10px] text-zinc-500">Alternância instantânea sem reiniciar o servidor</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Option 1: Gemini */}
              <button
                type="button"
                onClick={() => {
                  const updated: AiProviderConfig = { ...aiConfig, provider: 'gemini' };
                  setAiConfig(updated);
                  const newCreds = { ...creds, aiConfig: updated };
                  setCreds(newCreds);
                  onSaveCredentials(newCreds);
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  aiConfig.provider === 'gemini'
                    ? 'bg-cyan-950/40 border-cyan-400 text-white shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/30'
                    : 'bg-[#0f1017] border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    Google Gemini
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-extrabold">
                    Recomendado
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Nuvem de ultra-alta velocidade (Gemini 2.5 / 3.8 Flash). Visão multimodal de enquadramento.
                </p>
              </button>

              {/* Option 2: Ollama Local */}
              <button
                type="button"
                onClick={() => {
                  const updated: AiProviderConfig = { ...aiConfig, provider: 'ollama' };
                  setAiConfig(updated);
                  const newCreds = { ...creds, aiConfig: updated };
                  setCreds(newCreds);
                  onSaveCredentials(newCreds);
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  aiConfig.provider === 'ollama'
                    ? 'bg-purple-950/40 border-purple-400 text-white shadow-lg shadow-purple-950/40 ring-1 ring-purple-500/30'
                    : 'bg-[#0f1017] border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black text-white flex items-center gap-1.5">
                    <Laptop className="w-3.5 h-3.5 text-purple-400" />
                    Ollama / IA Local
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-extrabold">
                    100% Gratuito
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Executa diretamente no hardware local (Llama 3, DeepSeek R1). Custo zero em chamadas.
                </p>
              </button>

              {/* Option 3: Claude / OpenAI */}
              <button
                type="button"
                onClick={() => {
                  const updated: AiProviderConfig = { ...aiConfig, provider: 'openai' };
                  setAiConfig(updated);
                  const newCreds = { ...creds, aiConfig: updated };
                  setCreds(newCreds);
                  onSaveCredentials(newCreds);
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  aiConfig.provider === 'openai' || aiConfig.provider === 'anthropic'
                    ? 'bg-emerald-950/40 border-emerald-400 text-white shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500/30'
                    : 'bg-[#0f1017] border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black text-white flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-emerald-400" />
                    OpenAI / Claude
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold">
                    Custom API
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Suporte a chaves de terceiros (Anthropic Claude 3.5 Sonnet / OpenAI GPT-4o).
                </p>
              </button>
            </div>
          </div>

          {/* PANEL A: OLLAMA LOCAL CONFIGURATION */}
          {aiConfig.provider === 'ollama' && (
            <div className="space-y-4 p-5 bg-[#0e0f17] border border-purple-500/30 rounded-2xl animate-fadeIn">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Server className="w-4 h-4 text-purple-400" />
                    Configuração do Endpoint & Modelo Local (Ollama)
                  </span>
                  <p className="text-[11px] text-zinc-400">
                    O app fará chamadas diretamente para o daemon do Ollama em execução na sua máquina ou servidor.
                  </p>
                </div>
                {aiConfig.latencyMs ? (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 shrink-0">
                    ⚡ {aiConfig.latencyMs}ms de latência
                  </span>
                ) : null}
              </div>

              {/* Endpoint Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                  <span>Endpoint de Conexão do Ollama</span>
                  <span className="text-[10px] text-zinc-500">Padrão: http://localhost:11434</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiConfig.ollamaEndpoint || 'http://localhost:11434'}
                    onChange={(e) => {
                      const updated = { ...aiConfig, ollamaEndpoint: e.target.value };
                      setAiConfig(updated);
                    }}
                    placeholder="http://localhost:11434"
                    className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-mono"
                  />
                  <button
                    type="button"
                    disabled={isTestingLocalAi}
                    onClick={handleTestLocalAi}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-purple-950/40 cursor-pointer"
                  >
                    {isTestingLocalAi ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Testando...</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-3.5 h-3.5" />
                        <span>Testar Conexão Local</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Dica: Se estiver executando via Docker, utilize <code className="text-purple-300">http://host.docker.internal:11434</code> ou o IP local da máquina.
                </p>
              </div>

              {/* Quick Model Selector Pills */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                  <span>Seleção Rápida de Modelo Local:</span>
                  <span className="text-[10px] text-purple-400">Clique para selecionar</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'llama3:8b', label: 'Meta Llama 3 (8B)', tag: 'Mais Equilibrado' },
                    { id: 'deepseek-r1:8b', label: 'DeepSeek R1 (8B)', tag: 'Raciocínio & Ganchos' },
                    { id: 'mistral:7b', label: 'Mistral (7B)', tag: 'Alta Velocidade' },
                    { id: 'qwen2.5:7b', label: 'Qwen 2.5 (7B)', tag: 'Ótimo em Português' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        const updated = { ...aiConfig, ollamaModel: m.id };
                        setAiConfig(updated);
                        const newCreds = { ...creds, aiConfig: updated };
                        setCreds(newCreds);
                        onSaveCredentials(newCreds);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                        aiConfig.ollamaModel === m.id
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-900/50 border border-purple-400'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
                      }`}
                    >
                      <span>{m.label}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-purple-200">
                        {m.tag}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Model Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                  <span>Nome do Modelo no Ollama</span>
                  <span className="text-[10px] text-zinc-500 font-mono">ollama run &lt;modelo&gt;</span>
                </label>
                <input
                  type="text"
                  value={aiConfig.ollamaModel || 'llama3:8b'}
                  onChange={(e) => {
                    const updated = { ...aiConfig, ollamaModel: e.target.value };
                    setAiConfig(updated);
                  }}
                  placeholder="Ex: llama3:8b, deepseek-r1:8b, mistral, gemma2:9b"
                  className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              {/* Local Connection Diagnostic Message */}
              {localAiFeedback && (
                <div
                  className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                    localAiFeedback.success
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                      : 'bg-red-950/40 border-red-500/50 text-red-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {localAiFeedback.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <span>{localAiFeedback.message}</span>
                  </div>

                  {localAiFeedback.models && localAiFeedback.models.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-emerald-500/20">
                      <span className="text-[11px] text-zinc-300 block">
                        Modelos instalados detectados no seu Ollama (clique para aplicar):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {localAiFeedback.models.map((mod) => (
                          <button
                            key={mod}
                            type="button"
                            onClick={() => {
                              const updated = { ...aiConfig, ollamaModel: mod };
                              setAiConfig(updated);
                              const newCreds = { ...creds, aiConfig: updated };
                              setCreds(newCreds);
                              onSaveCredentials(newCreds);
                            }}
                            className="px-2 py-1 rounded-lg bg-black/60 hover:bg-purple-900/60 border border-emerald-500/30 text-[11px] text-emerald-300 font-mono transition"
                          >
                            ✓ {mod}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Instructions Guide */}
              <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-xl text-[11px] text-zinc-400 space-y-1">
                <span className="font-bold text-zinc-200 block">Como rodar o Ollama na sua máquina:</span>
                <ol className="list-decimal list-inside space-y-0.5 pl-1 text-zinc-400">
                  <li>Instale o Ollama em <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-purple-400 underline">ollama.com</a>.</li>
                  <li>No seu terminal, baixe o modelo desejado: <code className="text-purple-300 font-mono">ollama run llama3:8b</code>.</li>
                  <li>Inicie o serviço com: <code className="text-purple-300 font-mono">ollama serve</code> e clique em &quot;Testar Conexão Local&quot;.</li>
                </ol>
              </div>
            </div>
          )}

          {/* PANEL B: GEMINI CLOUD CONFIGURATION */}
          {aiConfig.provider === 'gemini' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 text-xs text-zinc-300 space-y-2">
                <div className="flex items-center gap-2 font-bold text-white text-sm">
                  <Key className="w-4 h-4 text-cyan-400" />
                  <span>Como vincular seu Google AI Studio ao projeto:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-zinc-400 pl-1">
                  <li>Acesse o <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-semibold">Google AI Studio (aistudio.google.com)</a> e entre com sua conta Google.</li>
                  <li>Clique no botão azul <strong>&quot;Create API key&quot;</strong> (é 100% gratuito).</li>
                  <li>Copie a chave gerada (começa com <code className="text-cyan-300 font-mono">AIzaSy...</code>) e cole no campo abaixo.</li>
                </ol>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                  <span>Chave de API do Google AI Studio (GEMINI_API_KEY)</span>
                  {geminiStatus.configured && (
                    <span className="text-[11px] text-emerald-400 font-normal">Chave ativa no servidor</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder={geminiStatus.configured ? 'Chave já configurada (insira outra para trocar)' : 'Cole sua chave AIzaSy... aqui'}
                    className="flex-1 bg-zinc-900/90 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <button
                    type="button"
                    disabled={geminiStatus.testing || (!geminiApiKey.trim() && !geminiStatus.configured)}
                    onClick={handleVerifyGemini}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-cyan-950/40 cursor-pointer"
                  >
                    {geminiStatus.testing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Validando...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Vincular Google Studio</span>
                      </>
                    )}
                  </button>
                </div>
                {geminiStatus.message && (
                  <p className={`text-xs font-semibold mt-1.5 ${geminiStatus.message.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
                    {geminiStatus.message}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* PANEL C: OPENAI & CLAUDE CUSTOM API CONFIGURATION */}
          {(aiConfig.provider === 'openai' || aiConfig.provider === 'anthropic') && (
            <div className="space-y-4 p-5 bg-[#0e0f17] border border-emerald-500/30 rounded-2xl animate-fadeIn">
              <div className="space-y-1">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" />
                  APIs de Terceiros (OpenAI & Anthropic Claude)
                </span>
                <p className="text-[11px] text-zinc-400">
                  Informe sua chave de API para direcionar as análises semânticas e geração de legendas para o Claude ou GPT.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">OpenAI API Key (sk-...)</label>
                  <input
                    type="password"
                    value={aiConfig.openaiApiKey || ''}
                    onChange={(e) => {
                      const updated = { ...aiConfig, openaiApiKey: e.target.value };
                      setAiConfig(updated);
                    }}
                    placeholder="sk-proj-..."
                    className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Anthropic Claude API Key (sk-ant-...)</label>
                  <input
                    type="password"
                    value={aiConfig.anthropicApiKey || ''}
                    onChange={(e) => {
                      const updated = { ...aiConfig, anthropicApiKey: e.target.value };
                      setAiConfig(updated);
                    }}
                    placeholder="sk-ant-..."
                    className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* 1. YOUTUBE DATA API V3 CARD */}
        {/* ============================================================ */}
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
                  <img src={creds.youtube.avatar} alt="Canal" className="w-11 h-11 rounded-full border-2 border-emerald-500/50" />
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
                    {creds.youtube.customUrl || 'Canal Autenticado'} • Renovação Automática Permanente • Verificado às {creds.youtube.verifiedAt || 'agora'}
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

          {/* ============================================================ */}
          {/* 1-CLICK GOOGLE LOGIN HERO BOX (ENTRAR COM O GOOGLE) */}
          {/* ============================================================ */}
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
                  className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white hover:bg-zinc-100 text-zinc-900 font-extrabold text-xs sm:text-sm shadow-xl shadow-black/40 hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-60"
                >
                  {/* Official Google G Logo */}
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
                    className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition flex items-center gap-1.5"
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
                    className="text-[11px] text-zinc-400 hover:text-white"
                  >
                    Fechar aviso
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-300">
                  <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800">
                    <strong className="text-white">1. Na janela que abriu:</strong> Escolha sua conta do Google / canal do YouTube e clique em <strong>Continuar</strong>.
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800">
                    <strong className="text-white">2. Concluir em 1 segundo:</strong> Copie o endereço da página final (ou o código <code className="text-pink-300">4/0...</code>) — ao voltar para esta aba, conectamos sozinho!
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={googleQuickPasteInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setGoogleQuickPasteInput(val);
                      if (val.trim().length > 12) {
                        handleGoogleQuickConnect(val.trim(), false);
                      }
                    }}
                    placeholder="Cole aqui o link da barra de endereço ou o código do Google (conecta na hora!)..."
                    className="flex-1 px-3.5 py-2 bg-[#0e0f17] border border-blue-500/40 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-400"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text?.trim()) {
                          await handleGoogleQuickConnect(text.trim(), false);
                        } else {
                          setSaveFeedback('⚠️ Área de transferência vazia. Copie o link ou código da janela do Google.');
                        }
                      } catch {
                        setSaveFeedback('⚠️ Cole o código/link no campo ao lado com Ctrl+V.');
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shrink-0 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Colar e Conectar Agora</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Inputs Row */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>Access Token / Código Google (Preenchido Automaticamente pelo Login)</span>
                <span className="text-[10px] text-emerald-400 font-mono">Aceita Link, Código 4/0..., Refresh 1//... ou ya29...</span>
              </label>
              <div className="relative">
                <input
                  type={showTokens.youtube ? 'text' : 'password'}
                  value={creds.youtube.accessToken}
                  onChange={(e) => {
                    const rawVal = e.target.value;
                    const val = rawVal.trim();
                    let access = rawVal;
                    let refresh = creds.youtube.refreshToken || '';

                    // If user pasted a Google Redirect URL (?code=4/...) or Auth Code (4/0...) or Refresh Token (1//...), auto-exchange immediately on the server!
                    if (
                      val.includes('code=4/') ||
                      val.includes('code=4%2F') ||
                      val.startsWith('4/0') ||
                      val.startsWith('4%2F0') ||
                      (val.startsWith('1//') && val.length > 20)
                    ) {
                      setSaveFeedback('🔄 Trocando código com o Google e conectando seu canal automaticamente...');
                      handleGoogleQuickConnect(val, false);
                      return;
                    }

                    // Check if user pasted a string containing ya29 or 1//
                    const yaMatch = val.match(/(ya29\.[a-zA-Z0-9_\-\.]+)/);
                    const refreshMatch = val.match(/(1\/\/[a-zA-Z0-9_\-]+)/);

                    if (yaMatch) {
                      access = yaMatch[1];
                      if (refreshMatch) {
                        refresh = refreshMatch[1];
                        setSaveFeedback('✨ Access Token (ya29...) e Refresh Token (1//...) extraídos com sucesso!');
                      } else {
                        setSaveFeedback('✨ Access Token do YouTube (ya29...) reconhecido!');
                      }
                    } else if (val.startsWith('{')) {
                      try {
                        const parsed = JSON.parse(val);
                        if (parsed.access_token) access = parsed.access_token;
                        if (parsed.refresh_token) refresh = parsed.refresh_token;
                        setSaveFeedback('✨ JSON do OAuth Playground reconhecido! Tokens preenchidos com sucesso.');
                      } catch (err) {}
                    }

                    setCreds({
                      ...creds,
                      youtube: { ...creds.youtube, accessToken: access, refreshToken: refresh },
                    });
                  }}
                  placeholder="Clique em 'Entrar com o Google' acima (ou cole qualquer código/token do Google aqui)"
                  className="w-full pl-3.5 pr-20 py-2.5 bg-[#0e0f17] border border-zinc-700/80 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleShowToken('youtube')}
                    className="p-1.5 text-zinc-400 hover:text-white transition"
                    title={showTokens.youtube ? 'Ocultar' : 'Exibir'}
                  >
                    {showTokens.youtube ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTestPlatform('youtube')}
                    disabled={testingPlatform === 'youtube'}
                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold transition flex items-center gap-1"
                  >
                    {testingPlatform === 'youtube' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                    <span>Testar</span>
                  </button>
                </div>
              </div>

              {/* Guidance when user has Refresh Token (1//) but missing or invalid ya29 Access Token */}
              {Boolean(
                creds.youtube.refreshToken?.startsWith('1//') &&
                (!creds.youtube.accessToken ||
                  creds.youtube.accessToken.startsWith('1//') ||
                  (!creds.youtube.accessToken.startsWith('ya29') && !creds.youtube.accessToken.startsWith('demo')))
              ) && (
                <div className="p-3.5 bg-gradient-to-r from-blue-950/70 via-indigo-950/60 to-purple-950/50 border border-blue-500/50 rounded-xl space-y-2 text-xs text-blue-200 animate-fadeIn">
                  <div className="font-bold flex items-center gap-1.5 text-cyan-300">
                    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Seu Refresh Token permanente (1//...) já está salvo com sucesso!</span>
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    Para o YouTube autorizar o envio dos vídeos, falta apenas você copiar o <strong>Access Token (começa com ya29...)</strong>:
                  </p>
                  <div className="p-2.5 bg-black/60 rounded-lg border border-blue-500/20 text-[11px] text-blue-100 space-y-1">
                    <p>1. No seu <strong>Google OAuth Playground (Passo 2)</strong>, localize o campo <strong>"Access token"</strong> (logo acima do Refresh Token).</p>
                    <p>2. Copie o valor (começa com <code className="text-pink-300 font-mono">ya29...</code>) e cole no campo de <strong>Access Token</strong> acima.</p>
                    <p>3. Clique em <strong>Testar</strong> para confirmar a conexão com seu canal!</p>
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
                      onClick={handleActivateDemoYouTube}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] inline-flex items-center gap-1 transition shadow"
                    >
                      <Sparkles className="w-3 h-3 text-yellow-300" />
                      Ativar Modo Demonstração (Testar Agora)
                    </button>
                  </div>
                </div>
              )}

              {/* Real-time Guidance if user pasted an Authorization Code (4/0...) */}
              {Boolean(
                creds.youtube.accessToken?.trim().startsWith('4/') ||
                creds.youtube.accessToken?.trim().startsWith('4%2F') ||
                creds.youtube.accessToken?.includes('code=')
              ) && (
                <div className="p-3.5 bg-gradient-to-r from-amber-950/60 to-yellow-950/40 border border-amber-500/50 rounded-xl space-y-2 text-xs text-amber-200 animate-fadeIn">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Você colou o Código de Autorização provisório (começa com 4/)</span>
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    Esse código é a etapa 1 do Google. Para transformá-lo nas chaves reais, falta <strong>apenas 1 clique</strong> no Google OAuth Playground:
                  </p>
                  <div className="p-2.5 bg-black/60 rounded-lg border border-amber-500/20 text-[11px] text-amber-100 space-y-1">
                    <p>1. Volte na aba do <strong>Google OAuth Playground (Passo 2)</strong>.</p>
                    <p>2. Clique no botão azul: <strong className="text-white underline">[Exchange authorization code for tokens]</strong>.</p>
                    <p>3. O Google preencherá o <strong>Access token (ya29...)</strong> e o <strong>Refresh token (1//...)</strong>. Basta copiar um deles e colar aqui!</p>
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
                      onClick={handleActivateDemoYouTube}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] inline-flex items-center gap-1 transition shadow"
                    >
                      <Sparkles className="w-3 h-3 text-yellow-300" />
                      Conectar Canal de Teste (1 Clique)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Permanent Refresh Token Input */}
            <div className="space-y-1.5 p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl">
              <label className="text-xs font-bold text-white flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Refresh Token (Permanente - Nunca Expira)
                </span>
                <span className="px-2 py-0.2 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full border border-emerald-500/30">
                  Solução Definitiva
                </span>
              </label>
              <div className="relative">
                <input
                  type={showTokens.youtube ? 'text' : 'password'}
                  value={creds.youtube.refreshToken || ''}
                  onChange={(e) =>
                    setCreds({
                      ...creds,
                      youtube: { ...creds.youtube, refreshToken: e.target.value },
                    })
                  }
                  placeholder="1//04..."
                  className="w-full pl-3.5 pr-28 py-2.5 bg-[#0e0f17] border border-emerald-500/30 rounded-xl text-xs font-mono text-emerald-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-400"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!creds.youtube.refreshToken?.trim()) {
                        setSaveFeedback('⚠️ Insira o Refresh Token (1//...) primeiro.');
                        setTimeout(() => setSaveFeedback(''), 4000);
                        return;
                      }

                      // Helpful reminder if user wants auto server renewal
                      if (!creds.youtube.clientSecret?.trim()) {
                        setSaveFeedback(
                          'ℹ️ Dica: Para renovação automática direta via servidor, configure o Client Secret. Ou use o Access Token gerado no OAuth Playground.'
                        );
                        setTimeout(() => setSaveFeedback(''), 5000);
                      }

                      setSaveFeedback('🔄 Renovando token com o Google...');
                      try {
                        const res = await fetchJson<any>('/api/refresh-token/youtube', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            refreshToken: creds.youtube.refreshToken,
                            clientId: creds.youtube.clientId,
                            clientSecret: creds.youtube.clientSecret,
                          }),
                        });
                        if (res.ok && res.data.success) {
                          const updated = {
                            ...creds,
                            youtube: {
                              ...creds.youtube,
                              accessToken: res.data.accessToken,
                              status: 'connected' as const,
                              verifiedAt: res.data.verifiedAt,
                            },
                          };
                          setCreds(updated);
                          onSaveCredentials(updated);
                          setSaveFeedback('✅ Token renovado com sucesso pelo Refresh Token!');
                          confetti({ particleCount: 30, spread: 50 });
                        } else {
                          setSaveFeedback(`❌ ${res.data?.error || 'Erro ao renovar token.'}`);
                          setTimeout(() => setSaveFeedback(''), 6000);
                        }
                      } catch (e) {
                        setSaveFeedback('❌ Falha na renovação do token.');
                        setTimeout(() => setSaveFeedback(''), 4000);
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition flex items-center gap-1 shadow"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Renovar Agora</span>
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-zinc-300">
                🔒 <strong>Como não precisar renovar mais:</strong> No Passo 2 do Google OAuth Playground, copie o campo <strong>Refresh token</strong> (começa com <code>1//</code>) e cole aqui. Nosso servidor salva tudo no disco do seu computador e não perde nunca!
              </p>
            </div>

            {/* Clear explanation of "O código expira depois de um tempo" */}
            <div className="p-3 bg-purple-950/20 border border-purple-500/30 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>O Google avisou que o código expira em pouco tempo?</span>
              </div>
              <div className="text-[11px] text-zinc-300 space-y-1.5 leading-relaxed">
                <p>
                  No Google OAuth Playground, o campo <strong>Authorization code</strong> (começa com <code>4/0...</code>) é apenas um código temporário de autorização.
                </p>
                <div className="p-2.5 bg-black/40 rounded-xl border border-purple-500/20 text-xs text-purple-200">
                  👉 <strong>Como obter a chave que NUNCA expira:</strong> No Passo 2 do Playground, clique no botão azul <strong>[Exchange authorization code for tokens]</strong>. O Google exibirá o <strong>Refresh token (1//...)</strong> e o <strong>Access token (ya29...)</strong>. Basta copiar um deles e colar aqui!
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-400">OAuth Client ID (Google Cloud Console)</label>
                <input
                  type="text"
                  value={creds.youtube.clientId || ''}
                  onChange={(e) =>
                    setCreds({
                      ...creds,
                      youtube: { ...creds.youtube, clientId: e.target.value },
                    })
                  }
                  placeholder="xxxx.apps.googleusercontent.com"
                  className="w-full px-3 py-2 bg-[#0e0f17] border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
                  <span>OAuth Client Secret (Chave Secreta)</span>
                  <span className="text-[10px] text-zinc-500 font-mono">Necessário p/ renovação</span>
                </label>
                <input
                  type="password"
                  value={creds.youtube.clientSecret || ''}
                  onChange={(e) =>
                    setCreds({
                      ...creds,
                      youtube: { ...creds.youtube, clientSecret: e.target.value },
                    })
                  }
                  placeholder="GOCSPX-..."
                  className="w-full px-3 py-2 bg-[#0e0f17] border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Optional YouTube Cookies Input for bypassing cloud datacenter IP blocks */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-red-400" />
                  Cookies do YouTube (Opcional - Para Servidores em Nuvem)
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">Formato Netscape cookies.txt</span>
              </label>
              <textarea
                rows={2}
                value={creds.youtube.cookies || ''}
                onChange={(e) =>
                  setCreds({
                    ...creds,
                    youtube: { ...creds.youtube, cookies: e.target.value },
                  })
                }
                placeholder="Cole o conteúdo do seu cookies.txt aqui para downloads 100% irrestritos em servidores de nuvem..."
                className="w-full px-3 py-2 bg-[#0e0f17] border border-zinc-800 rounded-xl text-xs font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-red-500 resize-none"
              />
              <p className="text-[10px] text-zinc-400">
                Se o YouTube exigir verificação de bot no servidor em nuvem, colar seus cookies ou usar a aba de upload local garante o processamento sem bloqueios.
              </p>
            </div>
          </div>

          {/* One-Click Demo Mode Banner */}
          <div className="p-4 bg-gradient-to-r from-red-950/40 via-purple-950/30 to-[#161726] border border-red-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-pink-400" />
                <span className="text-xs font-bold text-white">Não quer configurar o Google Cloud agora?</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-pink-500/20 text-pink-300 border border-pink-500/30">
                  1 Clique
                </span>
              </div>
              <p className="text-[11px] text-zinc-300">
                Ative o <strong>Modo Demonstração do YouTube</strong> para testar a geração de cortes, agendamento e fila automática imediatamente sem precisar criar projetos no Google.
              </p>
            </div>
            <button
              type="button"
              onClick={handleActivateDemoYouTube}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white text-xs font-bold transition shadow-lg shadow-red-900/30 active:scale-95 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span>Conectar Canal de Teste (1 Clique)</span>
            </button>
          </div>

          {/* Quick Guide & Scopes Accordion */}
          <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl text-xs text-zinc-400 space-y-3">
            <div className="flex items-center justify-between text-[11px] font-bold text-zinc-300 border-b border-zinc-800 pb-2">
              <span className="flex items-center gap-1.5 text-white">
                <HelpCircle className="w-4 h-4 text-red-400" />
                Como conectar seu canal real do YouTube (3 Passos):
              </span>
              <a
                href="https://developers.google.com/oauthplayground/#step1&scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.upload"
                target="_blank"
                rel="noreferrer"
                className="text-purple-400 hover:text-purple-300 underline inline-flex items-center gap-1 font-semibold"
              >
                Abrir Google OAuth Playground <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="text-[11px] space-y-1.5 text-zinc-300">
              <p>
                <strong>Por que o Google exige sua autorização?</strong> Como os vídeos serão publicados no <em>seu</em> canal do YouTube, o Google exige por segurança que o dono da conta aprove o acesso.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <div className="p-2.5 bg-black/40 border border-zinc-800/80 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-pink-400">Passo 1</span>
                  <p className="text-[11px] text-zinc-400">Clique no link acima do <em>OAuth Playground</em>.</p>
                </div>
                <div className="p-2.5 bg-black/40 border border-zinc-800/80 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-pink-400">Passo 2</span>
                  <p className="text-[11px] text-zinc-400">Clique em <em>"Authorize APIs"</em> e entre na sua conta Google.</p>
                </div>
                <div className="p-2.5 bg-black/40 border border-zinc-800/80 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-pink-400">Passo 3</span>
                  <p className="text-[11px] text-zinc-400">Clique em <em>"Exchange authorization code"</em> e cole o token aqui!</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-2 bg-black/80 rounded-xl font-mono text-[11px] text-yellow-300 border border-zinc-800">
              <span>https://www.googleapis.com/auth/youtube.upload</span>
              <button
                onClick={() => handleCopy('https://www.googleapis.com/auth/youtube.upload', 'scope-yt')}
                className="text-zinc-400 hover:text-white p-1"
                title="Copiar Escopo"
              >
                {copiedScope === 'scope-yt' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Diagnostic Status Feedback */}
          {testResults.youtube && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResults.youtube.success
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : 'bg-red-950/40 border-red-500/50 text-red-200'
              }`}
            >
              {testResults.youtube.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-2">
                <p className="font-bold leading-snug">{testResults.youtube.message}</p>
                {testResults.youtube.details && (
                  <p className="text-[11px] text-zinc-300 mt-0.5">{testResults.youtube.details}</p>
                )}

                {/* Specific Help If User Pasted Authorization Code */}
                {testResults.youtube.isAuthCode && (
                  <div className="mt-2.5 p-3 bg-black/60 rounded-xl border border-red-500/30 space-y-2 text-zinc-200">
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
                        onClick={handleActivateDemoYouTube}
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


        {/* ============================================================ */}
        {/* 2. INSTAGRAM REELS (META GRAPH API) CARD */}
        {/* ============================================================ */}
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
                    className="px-2.5 py-1 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-[11px] font-bold transition flex items-center gap-1"
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


        {/* ============================================================ */}
        {/* 3. TIKTOK CONTENT POSTING API CARD */}
        {/* ============================================================ */}
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
                    className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold transition flex items-center gap-1"
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
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-90 text-white text-[11px] font-bold flex items-center gap-1 shadow-md shadow-cyan-900/30 transition"
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

        {/* ============================================================ */}
        {/* 3.5. KWAI OPEN PLATFORM CARD */}
        {/* ============================================================ */}
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
                  setTestResults((prev) => ({
                    ...prev,
                    kwai: {
                      success: true,
                      message: 'Conta Demo Kwai ativada com sucesso!',
                      details: 'Você já pode enviar vídeos e publicar diretamente no Kwai.',
                    },
                  }));
                  confetti({ particleCount: 35, spread: 50 });
                }}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition"
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

        {/* ============================================================ */}
        {/* 4. WEBHOOKS DE NOTIFICAÇÃO (DISCORD & TELEGRAM) CARD */}
        {/* ============================================================ */}
        <div className="bg-[#141520] border border-zinc-800 hover:border-indigo-500/40 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-md">
                <Bell className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-white">Notificações Automáticas via Webhook</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950/80 border border-indigo-500/40 text-indigo-300">
                    Discord & Telegram
                  </span>
                </div>
                <p className="text-xs text-zinc-400">Receba alertas em tempo real no seu canal ou grupo quando um corte for processado ou postado</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTestWebhook}
              disabled={isTestingWebhook || (!discordWebhookUrl && !telegramBotToken)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-950/40 cursor-pointer"
            >
              {isTestingWebhook ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Enviando teste...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Testar Disparo</span>
                </>
              )}
            </button>
          </div>

          <div className="space-y-4">
            {webhookFeedback && (
              <div className="p-3 bg-zinc-900/90 border border-zinc-700/80 rounded-xl text-xs font-semibold text-zinc-200 animate-fadeIn">
                {webhookFeedback}
              </div>
            )}

            {/* Discord Webhook URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  Discord Webhook URL
                </span>
                <span className="text-[10px] text-zinc-400">Canal de Texto &gt; Editar Canal &gt; Integrações &gt; Webhooks</span>
              </label>
              <input
                type="url"
                value={discordWebhookUrl}
                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/1234567890/abcde..."
                className="w-full px-4 py-2.5 bg-[#0e0f17] border border-zinc-700/80 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Telegram Bot */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    Telegram Bot Token
                  </span>
                  <span className="text-[10px] text-zinc-400">@BotFather</span>
                </label>
                <input
                  type="text"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                  className="w-full px-4 py-2.5 bg-[#0e0f17] border border-zinc-700/80 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                  <span>Telegram Chat ID</span>
                  <span className="text-[10px] text-zinc-400">@userinfobot ou ID do grupo</span>
                </label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="Ex: -100123456789 ou 98765432"
                  className="w-full px-4 py-2.5 bg-[#0e0f17] border border-zinc-700/80 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Footer Navigation Back to Publishing */}
      {onNavigateToTab && (
        <div className="pt-4 flex justify-end">
          <button
            onClick={() => onNavigateToTab('publish')}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#7000ff] to-[#ff0055] text-white text-xs font-bold shadow-lg shadow-purple-900/30 hover:opacity-95 transition"
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
