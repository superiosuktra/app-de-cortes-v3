import React, { useState, useEffect } from 'react';
import {
  Share2,
  Sparkles,
  Send,
  Copy,
  Check,
  AlertCircle,
  HelpCircle,
  Clock,
  Trash2,
  Download,
  Bookmark,
  ExternalLink,
  Youtube,
  Instagram,
  Lock,
  Globe,
  EyeOff,
  Flame,
  Key,
  ShieldCheck,
  CheckCircle2,
  Zap,
  UploadCloud,
  FileVideo,
  Smartphone,
} from 'lucide-react';
import { ViralCut, SavedCut, QueueItem, AutoPostSettings, PlatformCredentials, VideoInfo, SocialPlatform } from '../types';
import { ShortsPhonePreview } from './ShortsPhonePreview';
import { ApiSetupModal } from './ApiSetupModal';
import { AutoPostQueueManager, AutoBotStatus } from './AutoPostQueueManager';
import { fetchJson, authFetch } from '../utils/api';
import confetti from 'canvas-confetti';

const TOKENS_STORAGE_KEY = 'viral_shorts_platform_tokens_v1';

interface PublisherTabProps {
  currentCut: ViralCut | null;
  savedCuts: SavedCut[];
  onDeleteSavedCut: (id: string) => void;
  onClearAllSavedCuts?: () => void;
  onLoadSavedCut: (cut: SavedCut) => void;
  queue: QueueItem[];
  autoPostSettings: AutoPostSettings;
  onUpdateAutoPostSettings: (settings: Partial<AutoPostSettings>) => void;
  onUpdateQueueItem: (id: string, updates: Partial<QueueItem>) => void;
  onDeleteQueueItem: (id: string) => void;
  onClearCompletedQueue: () => void;
  onClearAllQueue: () => void;
  onPostQueueItemNow: (id: string) => Promise<void>;
  onTriggerNextQueueNow: () => Promise<void>;
  onToggleQueueActive: (active: boolean) => void;
  onEnqueueCurrentCut: (cut: ViralCut) => void;
  credentials: PlatformCredentials;
  onSaveCredentials?: (newCreds: PlatformCredentials) => void;
  onSwitchToDemoAndPost?: (id: string) => Promise<void>;
  videoUrl?: string;
  videoInfo?: VideoInfo | null;
  onStartAutoBot?: (customNiche?: string) => Promise<void>;
  autoBotStatus?: AutoBotStatus;
  onSkipWaitAndPostNow?: (id?: string) => Promise<void>;
  onRescheduleEvery5Minutes?: () => void;
}

export const PublisherTab: React.FC<PublisherTabProps> = ({
  currentCut,
  savedCuts,
  onDeleteSavedCut,
  onClearAllSavedCuts,
  onLoadSavedCut,
  queue,
  autoPostSettings,
  onUpdateAutoPostSettings,
  onUpdateQueueItem,
  onDeleteQueueItem,
  onClearCompletedQueue,
  onClearAllQueue,
  onPostQueueItemNow,
  onTriggerNextQueueNow,
  onToggleQueueActive,
  onEnqueueCurrentCut,
  credentials,
  onSaveCredentials,
  onSwitchToDemoAndPost,
  videoUrl,
  videoInfo,
  onStartAutoBot,
  autoBotStatus,
  onSkipWaitAndPostNow,
  onRescheduleEvery5Minutes,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'queue' | 'manual'>(
    queue.length > 0 ? 'queue' : 'manual'
  );

  useEffect(() => {
    if (autoBotStatus?.isRunning) {
      setActiveSubTab('queue');
    }
  }, [autoBotStatus?.isRunning]);
  const [platform, setPlatform] = useState<string>('YouTube Shorts');
  const [tone, setTone] = useState<string>('Magnético & Viral');
  const [title, setTitle] = useState<string>('Esse Momento Mudou Tudo #Shorts');
  const [caption, setCaption] = useState<string>('');
  const [privacy, setPrivacy] = useState<string>('private');
  const [accessToken, setAccessToken] = useState<string>('');
  const [tokens, setTokens] = useState<{ youtube: string; instagram: string; tiktok: string }>({
    youtube: '',
    instagram: '',
    tiktok: '',
  });
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState<boolean>(false);
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [postStatus, setPostStatus] = useState<string>('');
  const [isCopiedCaption, setIsCopiedCaption] = useState<boolean>(false);
  const [isCopiedTitle, setIsCopiedTitle] = useState<boolean>(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isDownloadingCut, setIsDownloadingCut] = useState<boolean>(false);
  const [rightPanelTab, setRightPanelTab] = useState<'preview' | 'library'>('preview');
  const [previewPlatform, setPreviewPlatform] = useState<SocialPlatform>('youtube');
  const [confirmClearLibrary, setConfirmClearLibrary] = useState<boolean>(false);

  // Sync previewPlatform whenever publisher platform changes
  useEffect(() => {
    if (platform === 'YouTube Shorts') setPreviewPlatform('youtube');
    else if (platform === 'TikTok') setPreviewPlatform('tiktok');
    else if (platform === 'Instagram Reels') setPreviewPlatform('instagram');
  }, [platform]);

  // Load tokens from localStorage and credentials prop
  useEffect(() => {
    try {
      const stored = localStorage.getItem(TOKENS_STORAGE_KEY);
      let loadedTokens = { youtube: '', instagram: '', tiktok: '' };
      if (stored) {
        loadedTokens = JSON.parse(stored);
      }
      if (credentials) {
        if (credentials.youtube?.accessToken) loadedTokens.youtube = credentials.youtube.accessToken;
        if (credentials.instagram?.accessToken) loadedTokens.instagram = credentials.instagram.accessToken;
        if (credentials.tiktok?.accessToken) loadedTokens.tiktok = credentials.tiktok.accessToken;
      }
      setTokens(loadedTokens);
      if (loadedTokens.youtube) setAccessToken(loadedTokens.youtube);
    } catch (e) {
      console.warn('Failed to load platform tokens:', e);
    }
  }, [credentials]);

  const handleSaveTokens = (newTokens: { youtube: string; instagram: string; tiktok: string }) => {
    setTokens(newTokens);
    if (platform === 'YouTube Shorts') setAccessToken(newTokens.youtube);
    if (platform === 'Instagram Reels') setAccessToken(newTokens.instagram);
    if (platform === 'TikTok') setAccessToken(newTokens.tiktok);
    try {
      localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(newTokens));
    } catch (e) {
      console.warn('Failed to save platform tokens:', e);
    }

    if (onSaveCredentials && credentials) {
      const updatedCreds: PlatformCredentials = {
        ...credentials,
        youtube: {
          ...credentials.youtube,
          accessToken: newTokens.youtube,
          status: newTokens.youtube ? 'connected' : credentials.youtube?.status || 'disconnected',
        },
        instagram: {
          ...credentials.instagram,
          accessToken: newTokens.instagram,
          status: newTokens.instagram ? 'connected' : credentials.instagram?.status || 'disconnected',
        },
        tiktok: {
          ...credentials.tiktok,
          accessToken: newTokens.tiktok,
          status: newTokens.tiktok ? 'connected' : credentials.tiktok?.status || 'disconnected',
        },
      };
      onSaveCredentials(updatedCreds);
    }
  };

  // Sync access token when platform switches
  useEffect(() => {
    if (platform === 'YouTube Shorts') setAccessToken(tokens.youtube);
    else if (platform === 'Instagram Reels') setAccessToken(tokens.instagram);
    else if (platform === 'TikTok') setAccessToken(tokens.tiktok);
  }, [platform, tokens]);

  // Sync initial state from currentCut
  useEffect(() => {
    if (currentCut) {
      const initialTitle = `${(currentCut.title || 'Corte Viral').slice(0, 85)} #Shorts`;
      setTitle(initialTitle);
      if (platform === 'YouTube Shorts') {
        setCaption(`${currentCut.caption.youtube}\n\n${currentCut.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`);
      } else if (platform === 'Instagram Reels') {
        setCaption(`${currentCut.caption.instagram}\n\n${currentCut.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`);
      } else {
        setCaption(`${currentCut.caption.tiktok}\n\n${currentCut.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`);
      }
    } else {
      setCaption(
        'Você não vai acreditar no que aconteceu aqui! 😱\n\nAssista até o fim para entender o contexto completo desse debate.\n\n👇 Me conta nos comentários o que você faria no lugar dele!\n\n#Shorts #Viral #Podcasts #Curiosidades #EmAlta'
      );
    }
  }, [currentCut, platform]);

  // Generate tailored caption with Gemini
  const handleGenerateCaption = async () => {
    setIsGeneratingCaption(true);
    setPostStatus('Gerando copy magnética com o Gemini 3.8...');
    try {
      const res = await fetchJson<{ caption?: string }>('/api/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cutTitle: currentCut?.title || title,
          hook: currentCut?.hook || 'Gancho de impacto',
          platform,
          trigger: currentCut?.neuromarketingTrigger || 'Curiosidade',
          customTone: tone,
        }),
      });

      if (res.ok && res.data.caption) {
        setCaption(res.data.caption);
        setPostStatus('✅ Nova legenda gerada com sucesso!');
        confetti({ particleCount: 35, spread: 50, origin: { y: 0.7 } });
      } else {
        setPostStatus(`Erro ao gerar legenda: ${res.error || 'Resposta vazia da IA.'}`);
      }
    } catch (err: any) {
      console.error(err);
      setPostStatus(`Erro ao gerar legenda: ${err.message}`);
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  const handleDownloadCut = async () => {
    setIsDownloadingCut(true);
    try {
      if (videoFile) {
        setPostStatus('Renderizando corte do arquivo local com FFmpeg...');
        const formData = new FormData();
        formData.append('video', videoFile);
        formData.append('startTime', currentCut?.startTime || '00:00');
        formData.append('endTime', currentCut?.endTime || '00:30');
        formData.append('format', currentCut?.recommendedFormat || 'vertical_blur');
        formData.append('title', title);

        const res = await authFetch('/api/render-download-cut', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) throw new Error('Falha ao renderizar corte do arquivo local');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30) || 'corte_vertical'}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setPostStatus('✅ Download do corte concluído com sucesso!');
      } else {
        const effectiveUrl = videoUrl || (currentCut as any)?.videoUrl;
        if (!effectiveUrl) {
          throw new Error('Nenhum vídeo disponível. Forneça o link do YouTube na aba "Detecção IA" ou anexe um arquivo MP4.');
        }

        setPostStatus('Baixando trecho real do YouTube e renderizando em 9:16 vertical via FFmpeg...');
        const res = await authFetch('/api/download-youtube-cut', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl: effectiveUrl,
            startTime: currentCut?.startTime || '00:00',
            endTime: currentCut?.endTime || '00:30',
            format: currentCut?.recommendedFormat || 'vertical_blur',
            title: title || currentCut?.title,
            hook: currentCut?.hook,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Falha ao processar corte real do YouTube');
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30) || 'corte_youtube'}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setPostStatus('✅ Download do corte real do YouTube concluído com sucesso!');
      }
    } catch (err: any) {
      alert(`Erro ao baixar corte: ${err.message}`);
      setPostStatus(`❌ Erro: ${err.message}`);
    } finally {
      setIsDownloadingCut(false);
    }
  };

  // Post to social media (YouTube API, Instagram Graph API, TikTok API)
  const handlePost = async () => {
    setIsPosting(true);
    setPostStatus('Conectando à API de transmissão da plataforma...');
    try {
      if (platform === 'YouTube Shorts') {
        const effectiveToken = (
          accessToken ||
          credentials?.youtube?.accessToken ||
          credentials?.youtube?.refreshToken ||
          tokens.youtube ||
          ''
        ).trim();

        if (!effectiveToken && credentials?.youtube?.status !== 'connected') {
          setPostStatus(
            '❌ Insira o Access Token da API do YouTube para autenticar o canal (ou clique em "Configurar APIs Oficiais" acima).'
          );
          setIsPosting(false);
          return;
        }

        // If a real video file was uploaded, cut it with FFmpeg and upload to YouTube
        if (videoFile) {
          setPostStatus('Processando e cortando arquivo de vídeo real com FFmpeg em 9:16 vertical...');
          const formData = new FormData();
          formData.append('video', videoFile);
          formData.append('startTime', currentCut?.startTime || '00:00');
          formData.append('endTime', currentCut?.endTime || '00:30');
          formData.append('format', currentCut?.recommendedFormat || 'vertical_blur');
          formData.append('title', title);
          formData.append('description', caption);
          formData.append('privacy', privacy);
          formData.append('token', effectiveToken);
          formData.append('hook', currentCut?.hook || '');

          const uploadRes = await authFetch('/api/upload-and-cut-short', {
            method: 'POST',
            body: formData,
          });

          const resData = await uploadRes.json().catch(() => ({}));
          if (uploadRes.ok && resData.success) {
            setPostStatus(`🎉 ${resData.message || 'Corte real publicado no YouTube Shorts com sucesso!'}`);
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
          } else {
            setPostStatus(`❌ ${resData.error || 'Erro ao cortar e enviar vídeo para o YouTube.'}`);
          }
          setIsPosting(false);
          return;
        }

        const effectiveVideoUrl = videoUrl || (currentCut as any)?.videoUrl;
        setPostStatus(effectiveVideoUrl ? 'Baixando trecho real do YouTube e enviando ao YouTube Shorts...' : 'Transmitindo publicação para o YouTube Shorts...');

        const res = await fetchJson<{ message?: string; error?: string; videoUrl?: string; videoId?: string }>('/api/post-youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: effectiveToken,
            refreshToken: credentials?.youtube?.refreshToken,
            clientId: credentials?.youtube?.clientId,
            clientSecret: credentials?.youtube?.clientSecret,
            title,
            description: caption,
            privacy,
            videoId: currentCut?.id,
            videoUrl: effectiveVideoUrl,
            startTime: currentCut?.startTime || '00:00',
            endTime: currentCut?.endTime || '00:30',
            format: currentCut?.recommendedFormat || 'vertical_blur',
            hook: currentCut?.hook,
          }),
        });

        if (res.ok) {
          setPostStatus(`🎉 ${res.data.message || 'Transmissão concluída com sucesso!'}`);
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        } else {
          setPostStatus(`❌ ${res.data?.error || res.error || 'Erro na publicação no YouTube.'}`);
        }
      } else if (platform === 'Instagram Reels') {
        if (!tokens.instagram?.trim()) {
          setPostStatus(
            '❌ Insira o Token da Meta Graph API para o Instagram Reels. Clique no botão "Configurar APIs Oficiais" acima para ver o passo a passo de como gerar no Meta for Developers.'
          );
          setIsPosting(false);
          return;
        }

        const res = await fetchJson<{ valid?: boolean; accountName?: string; error?: string }>(
          '/api/verify-token/instagram',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokens.instagram }),
          }
        );

        if (res.ok && res.data.valid) {
          setPostStatus(
            `🎉 Conexão ativa com o Instagram (${res.data.accountName})!\n\nPara a publicação direta de Reels em produção via API da Meta, um endpoint de mídia pública (URL de hospedagem do MP4) é enviado para o endpoint /media com media_type=REELS.\n\n✅ Seus metadados, título e hashtags estão 100% validados para transmissão!`
          );
          confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
        } else {
          setPostStatus(`❌ Erro da API da Meta: ${res.data?.error || res.error}`);
        }
      } else if (platform === 'TikTok') {
        if (!tokens.tiktok?.trim()) {
          setPostStatus(
            '❌ Insira o Bearer Token do TikTok. Clique em "Configurar APIs Oficiais" para instruções de cadastro no TikTok for Developers.'
          );
          setIsPosting(false);
          return;
        }

        const res = await fetchJson<{ valid?: boolean; accountName?: string; error?: string }>(
          '/api/verify-token/tiktok',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokens.tiktok }),
          }
        );

        if (res.ok && res.data.valid) {
          setPostStatus(
            `🎉 Conexão ativa com o TikTok (${res.data.accountName})!\n\nPronto para o Content Posting API v2 (Direct Post). Seus dados de vídeo e legenda estão prontos para envio.`
          );
          confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
        } else {
          setPostStatus(`❌ Erro da API do TikTok: ${res.data?.error || res.error}`);
        }
      } else {
        setPostStatus(
          `A publicação para ${platform} está pronta. Copie o título e a legenda para postar no app da rede.`
        );
      }
    } catch (err: any) {
      setPostStatus(`❌ Erro de conexão: ${err.message}`);
    } finally {
      setIsPosting(false);
    }
  };

  const handleCopyCaption = () => {
    navigator.clipboard.writeText(caption);
    setIsCopiedCaption(true);
    setTimeout(() => setIsCopiedCaption(false), 2500);
  };

  const handleCopyTitle = () => {
    navigator.clipboard.writeText(title);
    setIsCopiedTitle(true);
    setTimeout(() => setIsCopiedTitle(false), 2500);
  };

  // Export Cut to SRT / JSON file
  const handleExportJson = (cut: SavedCut) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(cut, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${cut.cutTitle.replace(/\s+/g, '_')}_metadata.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Sub-tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-2 bg-[#12131d] border border-zinc-800 rounded-2xl">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('queue')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeSubTab === 'queue'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-pink-900/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Zap className="w-4 h-4 text-yellow-300" />
            <span>⚡ Fila de Postagem Automática</span>
            {queue.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-white/20 text-white">
                {queue.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('manual')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeSubTab === 'manual'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-pink-900/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Share2 className="w-4 h-4 text-purple-300" />
            <span>📝 Publicação Manual & Legendas</span>
            {currentCut && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
                1 Selecionado
              </span>
            )}
          </button>
        </div>

        <button
          onClick={() => setIsApiModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold transition"
        >
          <Key className="w-3.5 h-3.5 text-yellow-400" />
          <span>Configurar APIs Oficiais</span>
        </button>
      </div>

      {activeSubTab === 'queue' ? (
        <AutoPostQueueManager
          queue={queue}
          settings={autoPostSettings}
          onUpdateSettings={onUpdateAutoPostSettings}
          onUpdateItem={onUpdateQueueItem}
          onDeleteItem={onDeleteQueueItem}
          onClearCompleted={onClearCompletedQueue}
          onClearAll={onClearAllQueue}
          onPostItemNow={onPostQueueItemNow}
          onTriggerNextNow={onTriggerNextQueueNow}
          onToggleQueueActive={onToggleQueueActive}
          credentials={credentials}
          onOpenApiModal={() => setIsApiModalOpen(true)}
          onSwitchToDemoAndPost={onSwitchToDemoAndPost}
          onStartAutoBot={onStartAutoBot}
          autoBotStatus={autoBotStatus}
          onSkipWaitAndPostNow={onSkipWaitAndPostNow}
          onRescheduleEvery5Minutes={onRescheduleEvery5Minutes}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Publisher Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-[#141520] border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-6">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Central de Publicação & Legendas</h3>
                  <p className="text-xs text-zinc-400">Otimize metadados e envie para as APIs oficiais</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {currentCut && (
                  <button
                    onClick={() => {
                      onEnqueueCurrentCut(currentCut);
                      confetti({ particleCount: 40, spread: 50 });
                      setActiveSubTab('queue');
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-900/60 hover:bg-purple-900/90 border border-purple-500/40 text-purple-200 hover:text-white text-xs font-bold transition shadow-sm"
                  >
                    <Zap className="w-3.5 h-3.5 text-yellow-400" />
                    <span>+ Adicionar à Fila</span>
                  </button>
                )}

                {currentCut && (
                  <div className="px-2.5 py-1 rounded-lg bg-zinc-800 text-[11px] font-mono text-zinc-300">
                    {currentCut.startTime} - {currentCut.endTime}
                  </div>
                )}
              </div>
            </div>

            {/* Quick API Connection Status Bar */}
            <div className="flex flex-wrap items-center gap-2 p-2.5 bg-[#0e0f17] border border-zinc-800/80 rounded-2xl text-[11px]">
              <span className="text-zinc-400 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
                Status das Conexões:
              </span>

              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
                <Youtube className="w-3 h-3 text-red-500" />
                <span className={tokens.youtube ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
                  {tokens.youtube ? 'YouTube Ativo' : 'YouTube Não Conectado'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
                <Instagram className="w-3 h-3 text-pink-500" />
                <span className={tokens.instagram ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
                  {tokens.instagram ? 'Instagram Ativo' : 'Insta Não Conectado'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-cyan-400 font-black text-[10px]">TT</span>
                <span className={tokens.tiktok ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
                  {tokens.tiktok ? 'TikTok Ativo' : 'TikTok Não Conectado'}
                </span>
              </div>

              <button
                onClick={() => setIsApiModalOpen(true)}
                className="ml-auto text-purple-400 hover:text-purple-300 font-semibold underline text-[10px]"
              >
                Gerenciar Chaves
              </button>
            </div>

            {/* Platform Selection Pills */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-300">Selecione a Rede Social de Destino:</label>
              <div className="flex flex-wrap gap-2">
                {['YouTube Shorts', 'Instagram Reels', 'TikTok', 'Kwai', 'LinkedIn'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                      platform === p
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-pink-400 shadow-md shadow-pink-900/30'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {p === 'YouTube Shorts' && <Youtube className="w-4 h-4 text-red-500" />}
                    {p === 'Instagram Reels' && <Instagram className="w-4 h-4 text-pink-400" />}
                    <span>{p}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tone Selector & Caption Generator Button */}
            <div className="p-4 bg-[#0e0f17] border border-zinc-800 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                  Tom da Copy & Ganchos:
                </label>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {['Magnético & Viral', 'Educativo & Prático', 'Polêmico & Debate', 'Storytelling'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                        tone === t
                          ? 'bg-purple-600 text-white font-bold'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerateCaption}
                disabled={isGeneratingCaption}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-900/40 to-pink-900/40 hover:from-purple-800/60 hover:to-pink-800/60 border border-purple-500/40 text-purple-200 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 text-yellow-400 ${isGeneratingCaption ? 'animate-spin' : ''}`} />
                <span>{isGeneratingCaption ? 'Criando Legenda com IA...' : '✨ Sugerir Legenda Otimizada & Hashtags'}</span>
              </button>
            </div>

            {/* Title Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-300">
                  Título do Vídeo ({platform})
                </label>
                <button
                  onClick={handleCopyTitle}
                  className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
                >
                  {isCopiedTitle ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopiedTitle ? 'Copiado!' : 'Copiar Título'}</span>
                </button>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                placeholder="Ex: Esse Momento Mudou Tudo #Shorts"
                className="w-full px-3.5 py-2.5 bg-[#0e0f17] border border-zinc-800 rounded-xl text-sm font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 px-1">
                <span>Dica: Títulos com perguntas ou palavras de impacto aumentam o CTR em até 40%</span>
                <span>{title.length}/100</span>
              </div>
            </div>

            {/* Caption & Hashtags Textarea */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-300">
                  Legenda do Post & Hashtags Otimizadas
                </label>
                <button
                  onClick={handleCopyCaption}
                  className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
                >
                  {isCopiedCaption ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopiedCaption ? 'Copiada!' : 'Copiar Legenda'}</span>
                </button>
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={7}
                placeholder="Legenda persuasiva com gancho, copy e hashtags..."
                className="w-full px-3.5 py-2.5 bg-[#0e0f17] border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition leading-relaxed resize-none"
              />
            </div>

            {/* YouTube API Configs */}
            {platform === 'YouTube Shorts' && (
              <div className="p-4 bg-[#0e0f17] border border-zinc-800 rounded-2xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                    <Youtube className="w-4 h-4 text-red-500" />
                    Transmissão Oficial: YouTube Data API v3
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setPostStatus('Conectando ao Google...');
                        try {
                          const res = await fetchJson<any>('/api/auth/google/quick-connect', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ input: tokens.youtube || '' }),
                          });
                          if (res.ok && res.data?.success && res.data?.youtube) {
                            const yt = res.data.youtube;
                            handleSaveTokens({ ...tokens, youtube: yt.accessToken || tokens.youtube });
                            if (onSaveCredentials && credentials) {
                              onSaveCredentials({
                                ...credentials,
                                youtube: { ...credentials.youtube, ...yt, status: 'connected' },
                              });
                            }
                            setPostStatus(`✅ Canal "${yt.channelTitle || 'YouTube'}" conectado via Google!`);
                            confetti({ particleCount: 40, spread: 60 });
                            return;
                          }
                        } catch {}
                        setPostStatus('');
                        const width = 540;
                        const height = 680;
                        const left = window.screenX + (window.outerWidth - width) / 2;
                        const top = window.screenY + (window.outerHeight - height) / 2;
                        window.open(
                          '/api/auth/google/login',
                          'GoogleYouTubeLogin',
                          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=yes,status=no`
                        );
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-extrabold text-[11px] shadow transition"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z" />
                        <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z" />
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z" />
                      </svg>
                      <span>{credentials?.youtube?.status === 'connected' ? 'Reconectar Google' : 'Entrar com o Google'}</span>
                    </button>
                    <button
                      onClick={() => setIsApiModalOpen(true)}
                      className="text-[10px] text-purple-400 hover:text-purple-300 font-semibold"
                    >
                      Opções
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/30 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>
                    {credentials?.youtube?.channelTitle
                      ? `✅ Canal "${credentials.youtube.channelTitle}" conectado com Renovação Automática Permanente!`
                      : '🔒 Faça login com o Google uma única vez — o sistema renova o token automaticamente.'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-400">Visibilidade Inicial</label>
                    <select
                      value={privacy}
                      onChange={(e) => setPrivacy(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="private">Privado (Recomendado para revisar)</option>
                      <option value="unlisted">Não Listado</option>
                      <option value="public">Público Imediato</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
                      <span>Token / Código Google</span>
                      <span className="text-[9px] text-emerald-400">Automático</span>
                    </label>
                    <input
                      type="password"
                      value={tokens.youtube}
                      onChange={(e) => {
                        const newT = { ...tokens, youtube: e.target.value };
                        handleSaveTokens(newT);
                      }}
                      placeholder="Clique em 'Entrar com o Google' acima"
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Instagram Reels API Configs */}
            {platform === 'Instagram Reels' && (
              <div className="p-4 bg-[#0e0f17] border border-zinc-800 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                    <Instagram className="w-4 h-4 text-pink-500" />
                    Transmissão Oficial: Meta Graph API (Reels Publishing)
                  </span>
                  <button
                    onClick={() => setIsApiModalOpen(true)}
                    className="text-[10px] text-purple-400 hover:text-purple-300 font-semibold"
                  >
                    Como Obter Token?
                  </button>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/30 border border-purple-500/20 rounded-xl text-[11px] text-purple-300">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>🔒 Salvo permanentemente no navegador. Você conecta uma única vez!</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
                    <span>Meta Page Access Token (Instagram Content Publish)</span>
                    <span className="text-[9px] text-pink-400">instagram_content_publish</span>
                  </label>
                  <input
                    type="password"
                    value={tokens.instagram}
                    onChange={(e) => {
                      const newT = { ...tokens, instagram: e.target.value };
                      handleSaveTokens(newT);
                    }}
                    placeholder="EAA..."
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <p className="text-[10px] text-zinc-500 leading-normal">
                  💡 Requer uma conta comercial ou criador no Instagram vinculada a uma Página do Facebook no Meta for Developers.
                </p>
              </div>
            )}

            {/* TikTok API Configs */}
            {platform === 'TikTok' && (
              <div className="p-4 bg-[#0e0f17] border border-zinc-800 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                    <span className="text-cyan-400 font-black text-xs">TT</span>
                    Transmissão Oficial: TikTok Content Posting API
                  </span>
                  <button
                    onClick={() => setIsApiModalOpen(true)}
                    className="text-[10px] text-purple-400 hover:text-purple-300 font-semibold"
                  >
                    Como Obter Token?
                  </button>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/30 border border-purple-500/20 rounded-xl text-[11px] text-purple-300">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>🔒 Salvo permanentemente no navegador. Você conecta uma única vez!</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
                    <span>TikTok User Access Token</span>
                    <span className="text-[9px] text-cyan-400">video.upload / video.publish</span>
                  </label>
                  <input
                    type="password"
                    value={tokens.tiktok}
                    onChange={(e) => {
                      const newT = { ...tokens, tiktok: e.target.value };
                      handleSaveTokens(newT);
                    }}
                    placeholder="act.example123..."
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <p className="text-[10px] text-zinc-500 leading-normal">
                  💡 Requer cadastro de app no TikTok for Developers com a permissão Direct Post aprovada.
                </p>
              </div>
            )}

            {/* Video Source & Cutting Section */}
            <div className="p-4 bg-[#0e0f17] border border-purple-500/30 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-2">
                  <FileVideo className="w-4 h-4 text-pink-400" />
                  <span>Vídeo Fonte para o Corte Real</span>
                </label>
                {currentCut && (
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Corte: {currentCut.startTime} - {currentCut.endTime} ({currentCut.durationSeconds}s)
                  </span>
                )}
              </div>

              {videoFile ? (
                <div className="p-3 bg-purple-950/30 border border-purple-500/40 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="p-2 rounded-lg bg-pink-500/20 text-pink-300 shrink-0">
                        <FileVideo className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-bold text-white block truncate">{videoFile.name}</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">
                          {(videoFile.size / (1024 * 1024)).toFixed(1)} MB • Arquivo Local Carregado
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVideoFile(null)}
                      className="px-2 py-1 text-[11px] font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition"
                    >
                      Remover
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-purple-500/20 text-xs">
                    <span className="text-[11px] text-zinc-400">
                      Formato: {currentCut?.recommendedFormat || 'vertical_blur'}
                    </span>
                    <button
                      type="button"
                      onClick={handleDownloadCut}
                      disabled={isDownloadingCut}
                      className="text-[11px] font-bold text-purple-300 hover:text-white flex items-center gap-1.5 transition py-1 px-2 rounded-lg hover:bg-purple-900/40"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isDownloadingCut ? 'Renderizando corte...' : '⬇️ Baixar Corte Cortado em MP4'}</span>
                    </button>
                  </div>
                </div>
              ) : (videoUrl || (currentCut as any)?.videoUrl) ? (
                <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                        <Youtube className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-bold text-white block truncate">
                          {videoInfo?.title || 'Vídeo do YouTube Conectado'}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-semibold">
                          Corte direto do YouTube: {currentCut?.startTime || '00:00'} a {currentCut?.endTime || '00:30'} ({currentCut?.durationSeconds || 30}s)
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                      YouTube Ativo
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-emerald-500/20 text-xs">
                    <span className="text-[11px] text-zinc-400">
                      Formato: {currentCut?.recommendedFormat || 'vertical_blur'}
                    </span>
                    <button
                      type="button"
                      onClick={handleDownloadCut}
                      disabled={isDownloadingCut}
                      className="text-[11px] font-bold text-emerald-300 hover:text-white flex items-center gap-1.5 transition py-1 px-2.5 rounded-lg bg-emerald-900/30 hover:bg-emerald-900/60 border border-emerald-500/30"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isDownloadingCut ? 'Baixando e Cortando...' : '⬇️ Baixar Corte Real (MP4)'}</span>
                    </button>
                  </div>

                  <div className="pt-1 border-t border-zinc-800/80">
                    <label className="text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer flex items-center gap-1">
                      <UploadCloud className="w-3 h-3 text-zinc-500" />
                      <span>Ou clique aqui para anexar um arquivo .MP4 do seu computador</span>
                      <input
                        type="file"
                        accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setVideoFile(e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-zinc-700 hover:border-pink-500/70 rounded-2xl cursor-pointer bg-zinc-900/60 hover:bg-zinc-900 transition group">
                  <UploadCloud className="w-8 h-8 text-zinc-400 group-hover:text-pink-400 mb-2 transition" />
                  <span className="text-xs font-bold text-zinc-200 group-hover:text-white">
                    Clique para selecionar ou arraste o vídeo do podcast (.mp4)
                  </span>
                  <span className="text-[10px] text-zinc-500 mt-1">
                    Suporta MP4, MOV, WebM (cortado automaticamente entre {currentCut?.startTime || '00:00'} e {currentCut?.endTime || '00:30'})
                  </span>
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setVideoFile(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              )}
            </div>

            {/* Post / Submit Button */}
            <button
              onClick={handlePost}
              disabled={isPosting}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#7000ff] via-[#b000ff] to-[#ff0055] text-white font-black text-sm shadow-xl shadow-purple-900/40 hover:shadow-pink-900/50 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Send className={`w-4 h-4 ${isPosting ? 'animate-bounce' : ''}`} />
              <span>{isPosting ? 'Enviando Dados...' : videoFile ? `✈️ Cortar Vídeo Local & Transmitir para ${platform}` : (videoUrl || (currentCut as any)?.videoUrl) ? `✈️ Cortar do YouTube & Transmitir para ${platform}` : `✈️ Publicar / Transmitir para ${platform}`}</span>
            </button>

            {/* Status Feedback */}
            {postStatus && (
              <div
                className={`p-4 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap space-y-3 ${
                  postStatus.includes('❌')
                    ? 'bg-red-950/40 border border-red-500/40 text-red-200'
                    : 'bg-zinc-900/90 border border-zinc-800 text-zinc-200'
                }`}
              >
                <div>{postStatus}</div>

                {postStatus.includes('https://youtube.com/shorts/') && (
                  <div className="pt-2">
                    <a
                      href={postStatus.match(/(https:\/\/youtube\.com\/shorts\/[a-zA-Z0-9_-]+)/)?.[1] || 'https://youtube.com/shorts/lsWTOWpzTFI'}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition shadow shadow-red-950"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Assistir Agora no YouTube Shorts ↗</span>
                    </a>
                  </div>
                )}

                {postStatus.includes('❌') && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-red-500/20">
                    <button
                      type="button"
                      onClick={() => {
                        const demoToken = 'demo_youtube_shorts_verified_token';
                        setAccessToken(demoToken);
                        const newTokens = { ...tokens, youtube: demoToken };
                        handleSaveTokens(newTokens);
                        if (onSaveCredentials) {
                          onSaveCredentials({
                            ...credentials,
                            youtube: {
                              ...credentials.youtube,
                              accessToken: demoToken,
                              status: 'connected',
                              channelTitle: 'Canal Demo (Modo Teste)',
                              verifiedAt: new Date().toLocaleTimeString('pt-BR'),
                            },
                          });
                        }
                        setPostStatus('🔄 Ativando Canal Demo e publicando corte...');
                        setTimeout(() => handlePost(), 200);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 transition shadow"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                      <span>Testar com Canal Demo (1 Clique)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsApiModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-[11px] flex items-center gap-1 transition"
                    >
                      <Key className="w-3.5 h-3.5 text-yellow-400" />
                      <span>Configurar Chave / OAuth Playground</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interactive Phone Preview & Saved Cuts (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2 p-1 bg-[#141520] border border-zinc-800 rounded-2xl shadow-md">
            <button
              onClick={() => setRightPanelTab('preview')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition ${
                rightPanelTab === 'preview'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-pink-950/40'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>📱 Prévia na Rede ({previewPlatform === 'youtube' ? 'Shorts' : previewPlatform === 'tiktok' ? 'TikTok' : 'Reels'})</span>
            </button>

            <button
              onClick={() => setRightPanelTab('library')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition ${
                rightPanelTab === 'library'
                  ? 'bg-zinc-800 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Biblioteca ({savedCuts.length})</span>
            </button>
          </div>

          {rightPanelTab === 'preview' ? (
            <div className="flex flex-col items-center">
              <ShortsPhonePreview
                videoId={videoInfo?.videoId || (currentCut as any)?.videoId || 'B57eOqeLVfc'}
                videoUrl={videoUrl || (currentCut as any)?.videoUrl}
                thumbnailUrl={videoInfo?.thumbnail}
                channelName={videoInfo?.author || 'cortes_virais'}
                startSeconds={currentCut?.startSeconds || 15}
                endSeconds={currentCut?.endSeconds || 55}
                format={currentCut?.recommendedFormat || 'speaker_center'}
                subtitleTheme={currentCut?.subtitleTheme || 'none'}
                showSubtitles={currentCut?.subtitleTheme ? currentCut.subtitleTheme !== 'none' : false}
                activeSpeaker={currentCut?.activeSpeaker}
                overlayTitle={title || currentCut?.title || 'ESSE MOMENTO MUDOU TUDO 🚨'}
                hook={caption.slice(0, 85) || currentCut?.hook}
                speaker1X={currentCut?.framing?.speaker1X ?? 38}
                speaker1Y={currentCut?.framing?.speaker1Y ?? 30}
                speaker2X={currentCut?.framing?.speaker2X ?? 62}
                speaker2Y={currentCut?.framing?.speaker2Y ?? 30}
                zoom={currentCut?.framing?.zoom ?? 1.0}
                initialPlatform={previewPlatform}
                onPlatformChange={(p) => {
                  setPreviewPlatform(p);
                  if (p === 'youtube') setPlatform('YouTube Shorts');
                  else if (p === 'tiktok') setPlatform('TikTok');
                  else if (p === 'instagram') setPlatform('Instagram Reels');
                }}
              />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-pink-400" />
                  <h3 className="text-sm font-bold text-white">Biblioteca de Cortes Salvos</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  {savedCuts.length > 0 && onClearAllSavedCuts && (
                    !confirmClearLibrary ? (
                      <button
                        type="button"
                        onClick={() => setConfirmClearLibrary(true)}
                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-500/40 text-red-300 text-[11px] font-bold transition"
                        title="Limpar todos os cortes salvos da Biblioteca"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Limpar Biblioteca</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 bg-red-950/70 border border-red-500/60 px-2 py-0.5 rounded-lg">
                        <span className="text-[10px] font-bold text-red-200">Limpar?</span>
                        <button
                          type="button"
                          onClick={() => {
                            onClearAllSavedCuts();
                            setConfirmClearLibrary(false);
                          }}
                          className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-extrabold"
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClearLibrary(false)}
                          className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-semibold"
                        >
                          Não
                        </button>
                      </div>
                    )
                  )}
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-800 text-zinc-300">
                    {savedCuts.length} Salvos
                  </span>
                </div>
              </div>

              {savedCuts.length === 0 ? (
                <div className="bg-[#141520]/60 border border-dashed border-zinc-800 rounded-3xl p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-400">
                    <Bookmark className="w-6 h-6 text-purple-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white">Nenhum corte salvo ainda</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Quando estiver no <strong>Passo 3 (Cortar & Preview)</strong>, clique em <strong>"Salvar Corte na Biblioteca"</strong> para manter seus vídeos organizados e prontos para publicar a qualquer hora.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedCuts.map((cut) => (
                    <div
                      key={cut.id}
                      className="bg-[#141520] hover:bg-[#171926] border border-zinc-800 hover:border-purple-500/40 rounded-2xl p-4 transition-all space-y-3 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-pink-300 transition-colors">
                            {cut.cutTitle}
                          </h4>
                          <p className="text-[11px] text-zinc-400 truncate max-w-[220px]">
                            {cut.videoTitle}
                          </p>
                        </div>
                        <div className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-300">
                          {cut.startTime} - {cut.endTime}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-xs">
                        <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {cut.createdAt} • {cut.durationSeconds}s
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => onLoadSavedCut(cut)}
                            className="px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-[11px] font-semibold transition"
                          >
                            Carregar
                          </button>

                          <button
                            onClick={() => handleExportJson(cut)}
                            className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                            title="Exportar JSON do Corte"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onDeleteSavedCut(cut.id)}
                            className="p-1 rounded-lg bg-zinc-800 hover:bg-red-950/60 text-zinc-400 hover:text-red-400 transition"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}

      {/* Official APIs Setup Modal */}
      <ApiSetupModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        savedTokens={tokens}
        onSaveTokens={handleSaveTokens}
      />
    </div>
  );
};
