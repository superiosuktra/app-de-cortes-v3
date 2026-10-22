import React, { useState, useEffect } from 'react';
import {
  Zap,
  Sparkles,
  Play,
  FileText,
  Clock,
  Flame,
  Check,
  Copy,
  Scissors,
  ArrowRight,
  AlertCircle,
  HelpCircle,
  Brain,
  Hash,
  CheckCircle2,
  Share2,
  Mic,
  Users,
  Layout,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { VideoInfo, ViralCut, AutoPostSettings } from '../types';
import { fetchJson } from '../utils/api';
import confetti from 'canvas-confetti';

interface AnalyzeTabProps {
  videoUrl: string;
  setVideoUrl: (url: string) => void;
  videoInfo: VideoInfo | null;
  setVideoInfo: (info: VideoInfo | null) => void;
  transcript: string;
  setTranscript: (text: string) => void;
  userPrompt: string;
  setUserPrompt: (prompt: string) => void;
  viralCuts: ViralCut[];
  setViralCuts: (cuts: ViralCut[]) => void;
  onOpenCutInEditor: (cut: ViralCut) => void;
  autoPostSettings?: AutoPostSettings;
  onUpdateAutoPostSettings?: (newSettings: Partial<AutoPostSettings>) => void;
  onEnqueueCuts?: (cuts: ViralCut[]) => void;
  onEnqueueSingleCut?: (cut: ViralCut) => void;
  onNavigateToPublish?: () => void;
  queueCount?: number;
  onClearEditQueue?: () => void;
  onDeleteEditCut?: (cutId: string) => void;
}

const PRESET_VIDEOS = [
  {
    name: 'Os Sócios: Poder da Disciplina (Renato Cariani)',
    url: 'https://www.youtube.com/watch?v=B57eOqeLVfc',
    prompt: 'focar em dicas contra-intuitivas sobre foco, disciplina e vícios digitais',
  },
  {
    name: 'PrimoCast: Segredos de Negócios',
    url: 'https://www.youtube.com/watch?v=2ZIpFytCSVc',
    prompt: 'focar em lições de riqueza, mentalidade e frases de alto impacto',
  },
  {
    name: 'Huberman: Otimização Cerebral',
    url: 'https://www.youtube.com/watch?v=QmOF0crdyRU',
    prompt: 'focar em protocolos científicos rápidos de saúde e energia imediata',
  },
];

export const AnalyzeTab: React.FC<AnalyzeTabProps> = ({
  videoUrl,
  setVideoUrl,
  videoInfo,
  setVideoInfo,
  transcript,
  setTranscript,
  userPrompt,
  setUserPrompt,
  viralCuts,
  setViralCuts,
  onOpenCutInEditor,
  autoPostSettings,
  onUpdateAutoPostSettings,
  onEnqueueCuts,
  onEnqueueSingleCut,
  onNavigateToPublish,
  queueCount = 0,
  onClearEditQueue,
  onDeleteEditCut,
}) => {
  const [cutsCount, setCutsCount] = useState<number>(8);
  const [retentionStrategyOption, setRetentionStrategyOption] = useState<1 | 2 | 3>(3);
  const [isLoadingInfo, setIsLoadingInfo] = useState<boolean>(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [copiedCutId, setCopiedCutId] = useState<string | null>(null);
  const [transcriptNotice, setTranscriptNotice] = useState<string>('');
  const [queueNotice, setQueueNotice] = useState<{ count: number; message: string } | null>(null);
  const [confirmClearEditCuts, setConfirmClearEditCuts] = useState<boolean>(false);

  // Fetch video info when url changes or on blur
  const handleFetchVideoInfo = async (urlToFetch: string = videoUrl) => {
    if (!urlToFetch.trim()) return;
    setIsLoadingInfo(true);
    setStatusMessage('Buscando informações do vídeo no YouTube...');
    try {
      const res = await fetchJson<any>('/api/video-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToFetch }),
      });
      const data = res.data;
      if (res.ok && data) {
        setVideoInfo(data);
        setStatusMessage(`Vídeo carregado: ${data.title}`);
        // If transcript is empty, auto fetch it
        if (!transcript) {
          handleFetchTranscript(urlToFetch);
        }
      } else {
        setStatusMessage(`Aviso: ${data?.error || res.error || 'Não foi possível carregar os dados do vídeo.'}`);
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage('Erro ao conectar ao serviço do YouTube.');
    } finally {
      setIsLoadingInfo(false);
    }
  };

  // Fetch transcript from YouTube
  const handleFetchTranscript = async (urlToFetch: string = videoUrl) => {
    if (!urlToFetch.trim()) return;
    setIsLoadingTranscript(true);
    setStatusMessage('Buscando transcrição e legendas com timestamps...');
    setTranscriptNotice('');
    try {
      const res = await fetchJson<any>('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToFetch }),
      });
      const data = res.data;
      if (res.ok && data?.transcript) {
        setTranscript(data.transcript);
        setStatusMessage(`Transcrição obtida com sucesso! (${data.count} trechos de áudio).`);
      } else {
        setTranscriptNotice(
          data?.message ||
          res.error ||
          'Não foram encontradas legendas automáticas para este vídeo. Você pode colar a transcrição ou a IA analisará com base nos tópicos do vídeo.'
        );
        setStatusMessage('Transcrição não disponível no YouTube.');
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage('Falha ao obter transcrição automática.');
    } finally {
      setIsLoadingTranscript(false);
    }
  };

  // Run AI Viral Cut Analysis
  const handleRunAnalysis = async () => {
    if (!videoUrl.trim()) {
      setStatusMessage('Insira a URL ou ID do vídeo do YouTube primeiro.');
      return;
    }

    setIsAnalyzing(true);
    setStatusMessage(`Enviando para o Gemini analisar ${cutsCount} momentos magnéticos por todo o vídeo...`);

    try {
      const res = await fetchJson<any>('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          transcript,
          userPrompt,
          videoTitle: videoInfo?.title,
          channelName: videoInfo?.author,
          cutsCount,
        }),
      });

      const data = res.data;
      if (res.ok && data?.cuts && data.cuts.length > 0) {
        setViralCuts(data.cuts);
        setStatusMessage(`✅ Sucesso! ${data.cuts.length} cortes virais identificados com métricas de retenção.`);

        // Auto-Post Queue Integration
        if (autoPostSettings?.autoEnqueueOnGenerate && onEnqueueCuts) {
          onEnqueueCuts(data.cuts);
          setQueueNotice({
            count: data.cuts.length,
            message: `🚀 ${data.cuts.length} cortes foram adicionados à Fila de Postagem Automática (intervalo de ${autoPostSettings.intervalMinutes} min)!`,
          });
          confetti({ particleCount: 50, spread: 65, origin: { y: 0.6 } });
        }
      } else {
        setStatusMessage(`Erro na análise: ${data?.error || res.error || 'A IA não retornou cortes válidos.'}`);
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage(`Erro durante a análise: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyCaption = (cut: ViralCut) => {
    const textToCopy = `${cut.caption.youtube}\n\n${cut.hashtags.join(' ')}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedCutId(cut.id);
    setTimeout(() => setCopiedCutId(null), 2500);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Config Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Video Input & Configurations (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-[#141520] border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Configurar Vídeo</h3>
                  <p className="text-xs text-zinc-400">Insira o link ou escolha um teste rápido</p>
                </div>
              </div>

              {/* Status Pulse */}
              {isAnalyzing && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30 animate-pulse">
                  <Sparkles className="w-3 h-3 text-pink-400" />
                  IA Analisando
                </span>
              )}
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400">Testar com 1 Clique (Presets Prontos):</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_VIDEOS.map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setVideoUrl(preset.url);
                      setUserPrompt(preset.prompt);
                      handleFetchVideoInfo(preset.url);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-[11px] font-medium text-zinc-300 hover:text-white transition"
                  >
                    ⚡ {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* URL Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                <span>URL do Vídeo do YouTube</span>
                <span className="text-[10px] text-zinc-500">Suporta Vídeos, Podcasts e Shorts</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  onBlur={() => handleFetchVideoInfo()}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="flex-1 px-3.5 py-2.5 bg-[#0f1017] border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition"
                />
                <button
                  onClick={() => handleFetchVideoInfo()}
                  disabled={isLoadingInfo || !videoUrl}
                  className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition disabled:opacity-50"
                  title="Carregar Metadados"
                >
                  {isLoadingInfo ? '...' : 'Carregar'}
                </button>
              </div>
            </div>

            {/* Loaded Video Metadata Card */}
            {videoInfo && (
              <div className="flex gap-3 p-3 bg-[#191b28] border border-zinc-700/60 rounded-2xl">
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="w-24 h-16 object-cover rounded-xl border border-zinc-800"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoInfo.videoId}/0.jpg`;
                  }}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wide">
                    {videoInfo.author}
                  </span>
                  <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug">
                    {videoInfo.title}
                  </h4>
                </div>
              </div>
            )}

            {/* Custom User Prompt / Directive */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                <span>Direcionamento Estratégico (Prompt)</span>
                <span className="text-[10px] text-purple-400">Personalize o foco da IA</span>
              </label>
              <textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="Ex: gere vídeos com maior possibilidade de se tornar viral focando em humor, frases de choque e lições acionáveis..."
                rows={3}
                className="w-full px-3.5 py-2.5 bg-[#0f1017] border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition resize-none"
              />
            </div>

            {/* Transcripts Accordion */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Transcrição com Timecodes</span>
                </label>
                <button
                  onClick={() => handleFetchTranscript()}
                  disabled={isLoadingTranscript || !videoUrl}
                  className="text-[11px] font-semibold text-purple-400 hover:text-purple-300 transition"
                >
                  {isLoadingTranscript ? 'Obtendo...' : 'Reobter Legendas'}
                </button>
              </div>

              {transcriptNotice && (
                <div className="flex items-start gap-2 p-2.5 bg-amber-950/30 border border-amber-600/30 rounded-xl text-[11px] text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <p>{transcriptNotice}</p>
                </div>
              )}

              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="[00:15] Exemplo de transcrição com timestamps... (Obtido automaticamente do vídeo ou cole aqui)"
                rows={4}
                className="w-full px-3 py-2 bg-[#0f1017] border border-zinc-800 rounded-xl text-[11px] font-mono text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition resize-none"
              />
            </div>

            {/* Cuts Quantity Selector (User Request: Faça vários cortes e não só 3) */}
            <div className="space-y-2.5 p-3.5 bg-[#171825] border border-zinc-800 rounded-2xl">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-pink-400" />
                  <span>Quantidade de Cortes a Extrair</span>
                </label>
                <span className="text-[11px] text-pink-400 font-extrabold bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/30">
                  {cutsCount} Cortes Selecionados
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[6, 8, 10, 12].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setCutsCount(num)}
                    className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all ${
                      cutsCount === num
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-pink-900/40 border border-pink-400/50 scale-[1.02]'
                        : 'bg-[#0f1017] hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                  >
                    {num} Cortes
                    {num === 8 && <span className="block text-[8px] font-normal text-pink-200">Recomendado</span>}
                    {num === 12 && <span className="block text-[8px] font-normal text-purple-200">Completo</span>}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-zinc-400 leading-tight">
                A IA analisa e distribui os <strong>{cutsCount} cortes</strong> em sequência contínua a partir do momento de maior retenção.
              </p>
            </div>

            {/* 3-Option Viral Retention & Clean Screen Strategy Selector (Default: Option 3) */}
            <div className="space-y-2.5 p-3.5 bg-[#171825] border border-amber-500/30 rounded-2xl">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Estratégia de Retenção & Tela Limpa</span>
                </label>
                <span className="text-[10px] font-black bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/40">
                  Opção {retentionStrategyOption} Ativa
                </span>
              </div>

              <div className="space-y-1.5">
                {[
                  {
                    id: 1 as const,
                    title: '1. Corte Direto Tradicional',
                    desc: 'Inicia em 00:00 sem prévia de clímax, com legenda simples embaixo.',
                  },
                  {
                    id: 2 as const,
                    title: '2. Legenda Dinâmica Central',
                    desc: 'Legenda de 2 a 3 palavras no centro da tela sem caixa de fundo.',
                  },
                  {
                    id: 3 as const,
                    title: '3. Cold-Open Clímax (4s) + Legenda 2 Palavras + Zero Poluição ⭐',
                    desc: 'Pega os 4s mais impactantes do meio do corte e coloca no início (00:00–00:04) para prender o público + tela 100% limpa sem letreiros gigantes.',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRetentionStrategyOption(opt.id)}
                    className={`w-full p-2.5 rounded-xl text-left transition-all border ${
                      retentionStrategyOption === opt.id
                        ? 'bg-gradient-to-r from-amber-950/60 via-purple-950/50 to-pink-950/60 border-amber-400/70 text-white shadow-md'
                        : 'bg-[#0f1017] hover:bg-zinc-900 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-amber-300">{opt.title}</span>
                      {retentionStrategyOption === opt.id && (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-300 mt-0.5 leading-snug">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-Post Queue Toggle Card (User Request) */}
            <div className="p-4 bg-gradient-to-r from-purple-950/40 via-purple-900/20 to-pink-950/40 border border-purple-500/40 rounded-2xl space-y-2.5 shadow-md">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPostSettings?.autoEnqueueOnGenerate ?? true}
                  onChange={(e) =>
                    onUpdateAutoPostSettings?.({ autoEnqueueOnGenerate: e.target.checked })
                  }
                  className="w-4 h-4 mt-0.5 rounded accent-pink-500 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-white flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-yellow-300" />
                      Fila de Postagem Automática
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-pink-500/20 text-pink-300 border border-pink-500/40">
                      AUTO-POST
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-300 mt-1 leading-snug">
                    Ao gerar os vídeos, já entra direto em uma fila para postar automático no YouTube Shorts, Reels e TikTok.
                  </p>
                </div>
              </label>

              {autoPostSettings?.autoEnqueueOnGenerate && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-purple-500/30 text-[11px]">
                  <div className="flex items-center gap-1.5 text-zinc-300">
                    <Clock className="w-3 h-3 text-purple-400" />
                    <span>Intervalo:</span>
                    <select
                      value={autoPostSettings.intervalMinutes}
                      onChange={(e) =>
                        onUpdateAutoPostSettings?.({ intervalMinutes: Number(e.target.value) })
                      }
                      className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white font-semibold text-[11px] focus:outline-none focus:border-purple-500"
                    >
                      <option value={5}>5 min (Rápido)</option>
                      <option value={10}>10 min</option>
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={60}>1 hora</option>
                      <option value={120}>2 horas</option>
                      <option value={240}>4 horas</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    <span className={`w-2 h-2 rounded-full ${autoPostSettings.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                    <span className={autoPostSettings.isActive ? 'text-emerald-300' : 'text-amber-300'}>
                      {autoPostSettings.isActive ? 'Fila Ativa' : 'Fila Pausada'}
                    </span>
                    {queueCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                        {queueCount} na fila
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Queue Notification Success Banner */}
            {queueNotice && (
              <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl text-xs text-emerald-200 flex items-center justify-between gap-2 shadow-lg animate-fadeIn">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="leading-snug">{queueNotice.message}</span>
                </div>
                {onNavigateToPublish && (
                  <button
                    onClick={onNavigateToPublish}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shrink-0 transition shadow-md"
                  >
                    Ver Fila ({queueCount}) →
                  </button>
                )}
              </div>
            )}

            {/* Primary Action Button */}
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing || !videoUrl}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#7000ff] via-[#b000ff] to-[#ff0055] text-white font-extrabold text-sm shadow-xl shadow-purple-900/40 hover:shadow-pink-900/50 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Sparkles className={`w-5 h-5 text-yellow-300 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? `Analisando ${cutsCount} Momentos com IA...` : `🔥 Detectar ${cutsCount} Cortes Virais`}</span>
            </button>

            {/* Status Feedback Output */}
            {statusMessage && (
              <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-300 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-pink-500 animate-ping" />
                <span className="truncate">{statusMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Recommendations List (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-[#ff0055]" />
              <h3 className="text-lg font-extrabold text-white">
                Fila de Edição & Cortes da IA
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {viralCuts.length > 0 && onEnqueueCuts && (
                <button
                  onClick={() => {
                    onEnqueueCuts(viralCuts);
                    setQueueNotice({
                      count: viralCuts.length,
                      message: `🚀 Todos os ${viralCuts.length} cortes foram adicionados à Fila de Postagem Automática!`,
                    });
                    confetti({ particleCount: 50, spread: 60 });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-900/60 hover:bg-purple-900/90 border border-purple-500/40 text-purple-200 hover:text-white text-xs font-bold transition shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5 text-yellow-400" />
                  <span>Enfileirar Todos ({viralCuts.length})</span>
                </button>
              )}
              {viralCuts.length > 0 && onClearEditQueue && (
                !confirmClearEditCuts ? (
                  <button
                    type="button"
                    onClick={() => setConfirmClearEditCuts(true)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/40 text-red-300 text-xs font-bold transition"
                    title="Limpar todos os cortes da Fila de Edição"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar Fila de Edição</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-red-950/70 border border-red-500/60 px-2.5 py-1 rounded-xl animate-fadeIn">
                    <span className="text-[11px] font-bold text-red-200">Limpar tudo?</span>
                    <button
                      type="button"
                      onClick={() => {
                        onClearEditQueue();
                        setConfirmClearEditCuts(false);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-extrabold transition"
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearEditCuts(false)}
                      className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold transition"
                    >
                      Não
                    </button>
                  </div>
                )
              )}
              {viralCuts.length > 0 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-fuchsia-950/60 border border-fuchsia-500/30 text-fuchsia-300">
                  {viralCuts.length} Cortes
                </span>
              )}
            </div>
          </div>

          {/* Cuts Empty State */}
          {viralCuts.length === 0 && !isAnalyzing && (
            <div className="bg-[#141520]/60 border border-dashed border-zinc-800 rounded-3xl p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 border border-zinc-700/60 flex items-center justify-center mx-auto text-zinc-400">
                <Scissors className="w-8 h-8 text-pink-400" />
              </div>
              <div className="max-w-md mx-auto">
                <h4 className="text-base font-bold text-white mb-1">
                  Nenhum corte na fila de edição
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Insira o link de um vídeo do YouTube ao lado (ou clique em um dos presets de teste rápido) e clique no botão <strong>"Detectar Cortes Virais"</strong> para a IA encontrar os melhores momentos.
                </p>
              </div>
            </div>
          )}

          {/* Loading Skeleton */}
          {isAnalyzing && (
            <div className="space-y-4">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="bg-[#141520] border border-zinc-800 rounded-2xl p-6 space-y-3 animate-pulse"
                >
                  <div className="flex justify-between items-center">
                    <div className="h-5 w-48 bg-zinc-800 rounded-md" />
                    <div className="h-6 w-24 bg-pink-900/40 rounded-full" />
                  </div>
                  <div className="h-4 w-full bg-zinc-800/60 rounded" />
                  <div className="h-4 w-3/4 bg-zinc-800/40 rounded" />
                  <div className="flex gap-2 pt-2">
                    <div className="h-8 w-32 bg-zinc-800 rounded-lg" />
                    <div className="h-8 w-28 bg-zinc-800 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cuts List Cards */}
          {viralCuts.map((cut, index) => {
            const isCopied = copiedCutId === cut.id;
            return (
              <div
                key={cut.id || index}
                className="bg-[#141520] hover:bg-[#161826] border border-zinc-800 hover:border-purple-500/50 rounded-2xl p-5 sm:p-6 transition-all duration-300 shadow-lg space-y-4 group"
              >
                {/* Header: Title Overlay & Virality Score */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-600 to-pink-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <h4 className="text-sm sm:text-base font-black text-white group-hover:text-pink-300 transition-colors">
                      {cut.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Sequential Continuation Badge */}
                    <div className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-extrabold flex items-center gap-1">
                      <span>
                        {index === 0
                          ? '🎯 Pico #1 de Interesse (Início)'
                          : `🔗 Continuação da Parte ${index}`}
                      </span>
                    </div>

                    {/* Timecode Badge */}
                    <div className="px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 text-xs font-mono font-bold flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-pink-400" />
                      <span>{cut.startTime} → {cut.endTime} ({cut.durationSeconds}s)</span>
                    </div>

                    {/* Virality Score Badge */}
                    <div className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/40 text-pink-300 text-xs font-extrabold flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-pink-400 fill-pink-400" />
                      <span>{cut.viralityScore}%</span>
                    </div>

                    {onDeleteEditCut && (
                      <button
                        type="button"
                        onClick={() => onDeleteEditCut(cut.id)}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/60 border border-zinc-800 hover:border-red-500/40 text-zinc-500 hover:text-red-400 transition"
                        title="Remover este corte da Fila de Edição"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Opus Clip / Klap Layout & Speaker Intelligence Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 ${
                      cut.recommendedFormat === 'split_screen'
                        ? 'bg-yellow-950/40 text-yellow-300 border-yellow-500/40 shadow-sm shadow-yellow-950/30'
                        : cut.recommendedFormat === 'speaker_left'
                        ? 'bg-cyan-950/40 text-cyan-300 border-cyan-500/40'
                        : cut.recommendedFormat === 'speaker_right'
                        ? 'bg-amber-950/40 text-amber-300 border-amber-500/40'
                        : cut.recommendedFormat === 'vertical_blur'
                        ? 'bg-purple-950/40 text-purple-300 border-purple-500/40'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                    }`}
                  >
                    <Layout className="w-3 h-3" />
                    <span>
                      {cut.recommendedFormat === 'split_screen'
                        ? '⚡ Split 2 Câmeras (Opus Clip)'
                        : cut.recommendedFormat === 'speaker_left'
                        ? '🎙️ Foco no Host (Esq)'
                        : cut.recommendedFormat === 'speaker_right'
                        ? '🎙️ Foco no Convidado (Dir)'
                        : cut.recommendedFormat === 'vertical_blur'
                        ? '🎬 Fundo Desfocado HD'
                        : '📱 9:16 Recorte Central'}
                    </span>
                  </span>

                  {cut.activeSpeaker && (
                    <span className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-1">
                      {cut.activeSpeaker === 'ambos' ? (
                        <>
                          <Users className="w-3 h-3 text-pink-400" />
                          <span>👥 Diálogo entre Ambos</span>
                        </>
                      ) : cut.activeSpeaker === 'convidado' ? (
                        <>
                          <Mic className="w-3 h-3 text-yellow-400" />
                          <span>🗣️ Fala do Convidado</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3 h-3 text-cyan-400" />
                          <span>🗣️ Fala do Host</span>
                        </>
                      )}
                    </span>
                  )}

                  {cut.subtitleTheme && (
                    <span className="px-2 py-1 rounded-xl text-[10px] font-semibold bg-zinc-900/80 border border-zinc-800/80 text-zinc-400 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-yellow-400" />
                      <span>
                        {cut.subtitleTheme === 'none'
                          ? 'Vídeo 100% Limpo'
                          : cut.subtitleTheme === 'hormozi'
                          ? 'Legenda Hormozi'
                          : cut.subtitleTheme === 'beast'
                          ? 'Legenda MrBeast'
                          : cut.subtitleTheme === 'cyberpunk'
                          ? 'Legenda Cyberpunk'
                          : 'Legenda Discreta'}
                      </span>
                    </span>
                  )}
                </div>

                {/* Neuromarketing & Cold-Open Climax Hook Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-gradient-to-r from-amber-950/30 to-[#0d0e15] border border-amber-500/40 rounded-xl space-y-1">
                    <span className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider flex items-center justify-between">
                      <span>⚡ Gancho Cold-Open Clímax (00:00–00:04)</span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-[9px] font-mono">
                        {cut.teaserStartTime || cut.startTime} → {cut.teaserEndTime || cut.endTime}
                      </span>
                    </span>
                    <p className="text-zinc-100 font-bold italic line-clamp-2">
                      "{cut.teaserText || cut.payoff || cut.hook}"
                    </p>
                    <p className="text-[10px] text-amber-200/80">
                      Copiado do clímax e colocado nos primeiros 4s antes de iniciar o corte.
                    </p>
                  </div>

                  <div className="p-3 bg-[#0d0e15] border border-zinc-800/80 rounded-xl space-y-1">
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                      <Brain className="w-3 h-3" />
                      Gatilho & Legenda Limpa (2 Palavras)
                    </span>
                    <p className="text-zinc-200 font-semibold line-clamp-1">{cut.neuromarketingTrigger}</p>
                    {cut.overlaySubtitlesSample && cut.overlaySubtitlesSample.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {cut.overlaySubtitlesSample.slice(0, 4).map((chunk, cIdx) => (
                          <span
                            key={cIdx}
                            className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[9px] font-black text-yellow-300 uppercase"
                          >
                            {chunk}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Virality Analysis Explanation */}
                <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/50">
                  <strong className="text-pink-400">Por que viraliza:</strong> {cut.viralityAnalysis}
                </p>

                {/* Hashtags */}
                {cut.hashtags && cut.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cut.hashtags.map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-950/40 text-purple-300 border border-purple-800/40"
                      >
                        {tag.startsWith('#') ? tag : `#${tag}`}
                      </span>
                    ))}
                  </div>
                )}

                {/* Card Action Buttons */}
                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    onClick={() => onOpenCutInEditor(cut)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#7000ff] to-[#ff0055] hover:opacity-95 text-white text-xs font-bold shadow-md shadow-purple-900/30 transition-all hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <Scissors className="w-4 h-4" />
                    <span>Abrir no Editor & Cortar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  {onEnqueueSingleCut && (
                    <button
                      onClick={() => {
                        onEnqueueSingleCut(cut);
                        setQueueNotice({
                          count: 1,
                          message: `⚡ Corte "${cut.title}" adicionado à Fila de Postagem Automática!`,
                        });
                        confetti({ particleCount: 30, spread: 50 });
                      }}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-purple-500/40 bg-purple-950/40 hover:bg-purple-900/60 text-purple-200 hover:text-white text-xs font-bold transition shadow-sm"
                      title="Adicionar este corte à Fila de Auto-Post"
                    >
                      <Zap className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="hidden sm:inline">+ Fila</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleCopyCaption(cut)}
                    className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition ${
                      isCopied
                        ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                        : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:text-white hover:bg-zinc-700'
                    }`}
                    title="Copiar Legenda e Hashtags sugeridas"
                  >
                    {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{isCopied ? 'Copiada!' : 'Copiar Legenda'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
