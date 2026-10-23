import React, { useState, useEffect, useMemo } from 'react';
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
  Brain,
  CheckCircle2,
  Share2,
  Mic,
  Users,
  Layout,
  Smartphone,
  Trash2,
  X,
  Download,
  Filter,
  CheckSquare,
  Square,
  Package,
  RefreshCw,
  Search,
  ExternalLink,
  SlidersHorizontal,
} from 'lucide-react';
import { VideoInfo, ViralCut, AutoPostSettings, CutIntent, BatchRenderJob } from '../types';
import { fetchJson, authFetch } from '../utils/api';
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
    name: 'Os Sócios: Poder da Disciplina',
    url: 'https://www.youtube.com/watch?v=B57eOqeLVfc',
    prompt: 'focar em disciplina inabalável, foco contra distrações e rotina de alta performance',
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

const CATEGORIES = [
  'Todos',
  'História',
  'Opinião',
  'Debate',
  'Polêmica',
  'Humor',
  'Educação',
  'Dica prática',
  'Reação',
  'Frase de impacto',
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
  const [customCutsInput, setCustomCutsInput] = useState<string>('8');
  const [cutIntent, setCutIntent] = useState<CutIntent>('viral_hook');
  const [isLoadingInfo, setIsLoadingInfo] = useState<boolean>(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [copiedCutId, setCopiedCutId] = useState<string | null>(null);
  const [transcriptNotice, setTranscriptNotice] = useState<string>('');
  const [queueNotice, setQueueNotice] = useState<{ count: number; message: string } | null>(null);
  const [confirmClearEditCuts, setConfirmClearEditCuts] = useState<boolean>(false);

  // Selection & Filtering State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'selected' | 'rendered' | 'pending' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'score' | 'time' | 'duration' | 'recent'>('score');

  // Preview & Render Modal State
  const [previewingCut, setPreviewingCut] = useState<ViralCut | null>(null);
  const [renderingCutIds, setRenderingCutIds] = useState<Set<string>>(new Set());

  // Batch Job State
  const [activeBatchJob, setActiveBatchJob] = useState<BatchRenderJob | null>(null);
  const [isPackagingZip, setIsPackagingZip] = useState<boolean>(false);

  // Sync custom input
  useEffect(() => {
    setCustomCutsInput(String(cutsCount));
  }, [cutsCount]);

  // Fetch video info
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

  // Fetch transcript
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
        setStatusMessage(`Transcrição obtida com sucesso! (${data.count} falas registradas).`);
      } else {
        setTranscriptNotice(
          data?.message ||
            res.error ||
            'Não foram encontradas legendas automáticas. A IA analisará o vídeo distribuindo os cortes ao longo do tempo.'
        );
        setStatusMessage('Transcrição automática restrita no YouTube.');
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
    setStatusMessage(`Enviando para o Gemini analisar ${cutsCount} momentos por todo o vídeo...`);

    try {
      const res = await fetchJson<any>('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          transcript,
          userPrompt,
          intent: cutIntent,
          videoTitle: videoInfo?.title,
          channelName: videoInfo?.author,
          cutsCount,
        }),
      });

      const data = res.data;
      if (res.ok && data?.cuts && data.cuts.length > 0) {
        setViralCuts(data.cuts);
        // By default select all freshly generated cuts
        setSelectedIds(new Set(data.cuts.map((c: ViralCut) => c.id)));
        setStatusMessage(`✅ Sucesso! ${data.cuts.length} cortes virais identificados e distribuídos ao longo do podcast.`);

        if (autoPostSettings?.autoEnqueueOnGenerate && onEnqueueCuts) {
          onEnqueueCuts(data.cuts);
          setQueueNotice({
            count: data.cuts.length,
            message: `🚀 ${data.cuts.length} cortes foram adicionados à Fila de Postagem Automática!`,
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

  // Filter and Sort Cuts
  const filteredCuts = useMemo(() => {
    let list = [...viralCuts];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.hook.toLowerCase().includes(q) ||
          c.category?.toLowerCase().includes(q) ||
          c.hashtags.some((h) => h.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (selectedCategory !== 'Todos') {
      list = list.filter((c) => c.category?.toLowerCase() === selectedCategory.toLowerCase());
    }

    // Status filter
    if (selectedStatusFilter === 'selected') {
      list = list.filter((c) => selectedIds.has(c.id));
    } else if (selectedStatusFilter === 'rendered') {
      list = list.filter((c) => c.renderStatus === 'completed');
    } else if (selectedStatusFilter === 'pending') {
      list = list.filter((c) => !c.renderStatus || c.renderStatus === 'pending');
    } else if (selectedStatusFilter === 'failed') {
      list = list.filter((c) => c.renderStatus === 'failed');
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'score') return b.viralityScore - a.viralityScore;
      if (sortBy === 'time') return a.startSeconds - b.startSeconds;
      if (sortBy === 'duration') return a.durationSeconds - b.durationSeconds;
      return 0;
    });

    return list;
  }, [viralCuts, searchQuery, selectedCategory, selectedStatusFilter, sortBy, selectedIds]);

  // Multi-Selection Handlers
  const handleToggleSelect = (cutId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cutId)) {
        next.delete(cutId);
      } else {
        next.add(cutId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === viralCuts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(viralCuts.map((c) => c.id)));
    }
  };

  const handleSelectVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredCuts.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // Render Single Cut Directly
  const handleRenderSingleCut = async (cut: ViralCut) => {
    setRenderingCutIds((prev) => new Set(prev).add(cut.id));
    try {
      const res = await authFetch(`/api/clips/${cut.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          startTime: cut.startTime,
          endTime: cut.endTime,
          format: cut.recommendedFormat || 'speaker_center',
          subtitleTheme: cut.subtitleTheme || 'none',
          title: cut.title,
          hook: cut.hook,
          framing: cut.framing,
          subtitles: cut.overlaySubtitlesSample,
          removeSilence: cut.removeSilence,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}`);
      }

      const data = await res.json();
      // Update cut state
      setViralCuts(
        viralCuts.map((c) =>
          c.id === cut.id
            ? {
                ...c,
                renderStatus: 'completed',
                renderProgress: 100,
                previewUrl: data.previewUrl || `/api/clips/${cut.id}/preview`,
                downloadUrl: data.downloadUrl || `/api/clips/${cut.id}/download`,
                fileSize: data.fileSize,
              }
            : c
        )
      );

      confetti({ particleCount: 35, spread: 60 });
    } catch (err: any) {
      alert(`Falha ao renderizar corte: ${err.message}`);
      setViralCuts(
        viralCuts.map((c) =>
          c.id === cut.id
            ? {
                ...c,
                renderStatus: 'failed',
                renderError: err.message,
              }
            : c
        )
      );
    } finally {
      setRenderingCutIds((prev) => {
        const next = new Set(prev);
        next.delete(cut.id);
        return next;
      });
    }
  };

  // Render Selected Cuts in Batch
  const handleRenderSelected = async () => {
    const targets = viralCuts.filter((c) => selectedIds.has(c.id));
    if (targets.length === 0) {
      alert('Selecione ao menos um corte para renderizar.');
      return;
    }

    try {
      const res = await authFetch('/api/batch/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuts: targets,
          videoUrl,
        }),
      });

      const data = await res.json();
      if (res.ok && data.jobId) {
        setActiveBatchJob({
          id: data.jobId,
          type: 'render',
          status: 'rendering',
          progress: 5,
          currentStep: `Renderizando ${targets.length} cortes selecionados...`,
          totalItems: targets.length,
          completedItems: 0,
          failedItems: 0,
          itemIds: targets.map((c) => c.id),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } else {
        throw new Error(data.error || 'Erro ao iniciar renderização em lote.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  // Polling Batch Job Status
  useEffect(() => {
    if (!activeBatchJob || activeBatchJob.status === 'completed' || activeBatchJob.status === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await authFetch(`/api/batch/${activeBatchJob.id}`);
        if (res.ok) {
          const updated: BatchRenderJob = await res.json();
          setActiveBatchJob(updated);

          // If completed, update cut statuses
          if (updated.status === 'completed') {
            setViralCuts(
              viralCuts.map((c) =>
                updated.itemIds.includes(c.id)
                  ? {
                      ...c,
                      renderStatus: 'completed',
                      previewUrl: `/api/clips/${c.id}/preview`,
                      downloadUrl: `/api/clips/${c.id}/download`,
                    }
                  : c
              )
            );
            confetti({ particleCount: 70, spread: 75 });
          }
        }
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
  }, [activeBatchJob, viralCuts]);

  // Bulk ZIP Download Handler (Downloads selected cuts or entire sequence)
  const handleBulkZipDownload = async (onlySelected: boolean = true) => {
    const targets = onlySelected
      ? viralCuts.filter((c) => selectedIds.has(c.id))
      : viralCuts;

    if (targets.length === 0) {
      alert('Nenhum corte selecionado para baixar em ZIP.');
      return;
    }

    setIsPackagingZip(true);
    setStatusMessage(`Iniciando empacotamento em ZIP de ${targets.length} cortes com SRT e metadados...`);

    try {
      const res = await authFetch('/api/clips/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuts: targets,
          videoTitle: videoInfo?.title || 'cortes_virais',
        }),
      });

      const data = await res.json();
      if (res.ok && data.jobId) {
        // Poll for zip completion
        const zipJobId = data.jobId;
        const checkInterval = setInterval(async () => {
          try {
            const jobRes = await authFetch(`/api/batch/${zipJobId}`);
            if (jobRes.ok) {
              const jobData = await jobRes.json();
              if (jobData.status === 'completed') {
                clearInterval(checkInterval);
                setIsPackagingZip(false);
                setStatusMessage('✅ Pacote ZIP pronto! O download iniciará automaticamente.');

                // Trigger download
                window.location.href = `/api/batch/${zipJobId}/download`;
                confetti({ particleCount: 65, spread: 70 });
              } else if (jobData.status === 'failed') {
                clearInterval(checkInterval);
                setIsPackagingZip(false);
                alert(`Erro ao gerar ZIP: ${jobData.error}`);
              }
            }
          } catch {
            clearInterval(checkInterval);
            setIsPackagingZip(false);
          }
        }, 1500);
      } else {
        throw new Error(data.error || 'Falha ao iniciar criação do arquivo ZIP.');
      }
    } catch (err: any) {
      setIsPackagingZip(false);
      alert(`Erro: ${err.message}`);
    }
  };

  const handleCopyCaption = (cut: ViralCut) => {
    const textToCopy = `${cut.caption.youtube}\n\n${cut.hashtags.join(' ')}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedCutId(cut.id);
    setTimeout(() => setCopiedCutId(null), 2500);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Config Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input & AI Configuration (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-[#141520] border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Importar & Analisar</h3>
                  <p className="text-xs text-zinc-400">Selecione podcast do YouTube ou upload local</p>
                </div>
              </div>

              {isAnalyzing && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30 animate-pulse">
                  <Sparkles className="w-3 h-3 text-pink-400" />
                  IA Analisando
                </span>
              )}
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400">Presets de Demonstração Rápida:</label>
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
                <span>URL do Vídeo ou Podcast</span>
                <span className="text-[10px] text-zinc-500">YouTube Podcasts & Long-form</span>
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
                >
                  {isLoadingInfo ? '...' : 'Carregar'}
                </button>
              </div>
            </div>

            {/* Video Metadata Card */}
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

            {/* Cuts Quantity Configuration (NO 12 LIMIT: ANY QUANTITY FROM 1 TO 50+) */}
            <div className="space-y-2.5 p-3.5 bg-[#171825] border border-zinc-800 rounded-2xl">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-pink-400" />
                  <span>Quantidade de Cortes Desejada</span>
                </label>
                <span className="text-[11px] text-pink-400 font-extrabold bg-pink-500/10 px-2.5 py-0.5 rounded-full border border-pink-500/30">
                  {cutsCount} {cutsCount === 1 ? 'Corte' : 'Cortes'}
                </span>
              </div>

              {/* Presets Grid */}
              <div className="grid grid-cols-6 gap-1.5">
                {[1, 5, 12, 20, 30, 50].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      setCutsCount(num);
                      setCustomCutsInput(String(num));
                    }}
                    className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all ${
                      cutsCount === num
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md border border-pink-400/50 scale-[1.02]'
                        : 'bg-[#0f1017] hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>

              {/* Custom Number Input */}
              <div className="flex items-center gap-2 pt-1 text-xs text-zinc-300">
                <label className="shrink-0 text-[11px] text-zinc-400">Ou digite o número exato:</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={customCutsInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomCutsInput(val);
                    const n = parseInt(val, 10);
                    if (!isNaN(n) && n >= 1) {
                      setCutsCount(n);
                    }
                  }}
                  className="w-20 px-2.5 py-1 bg-[#0f1017] border border-zinc-700 rounded-lg text-white font-bold text-center text-xs focus:outline-none focus:border-pink-500"
                />
                <span className="text-[10px] text-zinc-500">(Sem limite fixo)</span>
              </div>

              <p className="text-[10px] text-zinc-400 leading-tight">
                A IA distribui os cortes por <strong>toda a extensão do vídeo</strong> (início, terço médio, clímax e conclusão).
              </p>
            </div>

            {/* Intent Selector */}
            <div className="space-y-2 p-3 bg-[#171825] border border-cyan-500/20 rounded-2xl">
              <label className="text-xs font-bold text-white flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Intenção Editorial da Seleção</span>
                </span>
                <span className="text-[10px] font-bold text-cyan-300">Critério IA</span>
              </label>

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'viral_hook' as const, label: '⚡ Gancho' },
                  { id: 'storytelling' as const, label: '📖 História' },
                  { id: 'controversy' as const, label: '🔥 Debate' },
                  { id: 'comedy' as const, label: '😂 Humor' },
                  { id: 'educational' as const, label: '🎓 Educativo' },
                  { id: 'motivational' as const, label: '🚀 Foco' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCutIntent(item.id)}
                    className={`py-1.5 px-2 text-center rounded-lg text-[11px] font-bold transition border ${
                      cutIntent === item.id
                        ? 'bg-cyan-950/60 border-cyan-400 text-cyan-200 shadow-sm'
                        : 'bg-[#0f1017] hover:bg-zinc-800 border-zinc-800 text-zinc-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Primary Action Button */}
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing || !videoUrl}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#7000ff] via-[#b000ff] to-[#ff0055] text-white font-extrabold text-sm shadow-xl shadow-purple-900/40 hover:shadow-pink-900/50 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Sparkles className={`w-5 h-5 text-yellow-300 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? `Analisando e distribuindo ${cutsCount} cortes...` : `🔥 Detectar ${cutsCount} Cortes em Todo o Vídeo`}</span>
            </button>

            {/* Status Output */}
            {statusMessage && (
              <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-300 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-pink-500 animate-ping" />
                <span className="truncate">{statusMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Cuts Grid, Multi-Select Toolbar & Studio Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Studio Master Toolbar with Checkbox & Bulk Actions */}
          <div className="p-4 bg-[#141520] border border-zinc-800 rounded-3xl shadow-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Left Zone: Selection Controls */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleSelectAll}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition"
                  title="Alternar seleção de todos os cortes"
                >
                  {selectedIds.size === viralCuts.length && viralCuts.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-pink-400" />
                  ) : (
                    <Square className="w-4 h-4 text-zinc-400" />
                  )}
                  <span>Selecionar Todos ({viralCuts.length})</span>
                </button>

                {selectedIds.size > 0 && (
                  <button
                    onClick={handleDeselectAll}
                    className="text-xs text-zinc-400 hover:text-white transition"
                  >
                    Desmarcar Todos
                  </button>
                )}

                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-pink-500/15 border border-pink-500/30 text-pink-300">
                  {selectedIds.size} de {viralCuts.length} Selecionados
                </span>
              </div>

              {/* Right Zone: Batch Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleBulkZipDownload(true)}
                  disabled={selectedIds.size === 0 || isPackagingZip}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition shadow-md disabled:opacity-40"
                  title="Baixa apenas os cortes selecionados em um arquivo ZIP com SRT e CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Selecionados (.ZIP)</span>
                </button>

                <button
                  onClick={handleRenderSelected}
                  disabled={selectedIds.size === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold transition shadow-md disabled:opacity-40"
                  title="Renderiza em alta resolução todos os cortes marcados"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Renderizar Selecionados</span>
                </button>

                <button
                  onClick={() => handleBulkZipDownload(false)}
                  disabled={viralCuts.length === 0 || isPackagingZip}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition disabled:opacity-40"
                  title="Baixa a sequência inteira de cortes de uma vez"
                >
                  <Package className="w-3.5 h-3.5 text-amber-400" />
                  <span>Baixar Tudo (.ZIP)</span>
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-zinc-800/80">
              <div className="sm:col-span-5 relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por fala, tema ou gancho..."
                  className="w-full pl-8 pr-3 py-1.5 bg-[#0f1017] border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Category Dropdown */}
              <div className="sm:col-span-4">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#0f1017] border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-purple-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      Categoria: {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="sm:col-span-3">
                <select
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-[#0f1017] border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-purple-500"
                >
                  <option value="all">Status: Todos</option>
                  <option value="selected">Marcados ({selectedIds.size})</option>
                  <option value="rendered">Prontos</option>
                  <option value="pending">Pendentes</option>
                  <option value="failed">Com Erro</option>
                </select>
              </div>
            </div>
          </div>

          {/* Active Batch Progress Banner */}
          {activeBatchJob && (
            <div className="p-4 bg-purple-950/40 border border-purple-500/40 rounded-2xl shadow-lg space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between text-xs text-purple-200">
                <div className="flex items-center gap-2">
                  <RefreshCw className={`w-4 h-4 text-purple-400 ${activeBatchJob.status === 'rendering' ? 'animate-spin' : ''}`} />
                  <span className="font-bold">{activeBatchJob.currentStep}</span>
                </div>
                <span className="font-mono font-bold text-pink-300">{activeBatchJob.progress}%</span>
              </div>
              <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${activeBatchJob.progress}%` }}
                />
              </div>
              {activeBatchJob.status === 'completed' && activeBatchJob.zipDownloadUrl && (
                <div className="flex justify-end pt-1">
                  <a
                    href={activeBatchJob.zipDownloadUrl}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Arquivo ZIP Pronto
                  </a>
                </div>
              )}
            </div>
          )}

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
                  Insira o link de um vídeo do YouTube ao lado e clique no botão <strong>"Detectar Cortes em Todo o Vídeo"</strong> para gerar os melhores momentos.
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
                </div>
              ))}
            </div>
          )}

          {/* Cuts List Cards with Checkboxes & Render Action */}
          <div className="space-y-4">
            {filteredCuts.map((cut, index) => {
              const isSelected = selectedIds.has(cut.id);
              const isRendering = renderingCutIds.has(cut.id);
              const isRendered = cut.renderStatus === 'completed';
              const isCopied = copiedCutId === cut.id;

              return (
                <div
                  key={cut.id || index}
                  className={`bg-[#141520] hover:bg-[#161826] border rounded-2xl p-5 sm:p-6 transition-all duration-300 shadow-lg space-y-4 group ${
                    isSelected
                      ? 'border-pink-500/70 ring-1 ring-pink-500/30'
                      : 'border-zinc-800 hover:border-purple-500/40'
                  }`}
                >
                  {/* Header: Checkbox + Title + Badges */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Selection Checkbox */}
                      <button
                        onClick={() => handleToggleSelect(cut.id)}
                        className="p-1 text-zinc-400 hover:text-pink-400 transition shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-pink-500" />
                        ) : (
                          <Square className="w-5 h-5 text-zinc-500" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-300 text-[10px] font-black flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {cut.category || 'Destaque'}
                          </span>
                          {isRendered ? (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                              ● Pronto
                            </span>
                          ) : isRendering ? (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40 animate-pulse">
                              ⏳ Renderizando...
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-zinc-400">
                              Pendente
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm sm:text-base font-black text-white group-hover:text-pink-300 transition-colors truncate mt-1">
                          {cut.title}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Timecode */}
                      <div className="px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 text-xs font-mono font-bold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-pink-400" />
                        <span>{cut.startTime} → {cut.endTime} ({cut.durationSeconds}s)</span>
                      </div>

                      {/* Score Badge */}
                      <div className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/40 text-pink-300 text-xs font-extrabold flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-pink-400 fill-pink-400" />
                        <span>{cut.viralityScore}%</span>
                      </div>

                      {onDeleteEditCut && (
                        <button
                          type="button"
                          onClick={() => onDeleteEditCut(cut.id)}
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/60 border border-zinc-800 hover:border-red-500/40 text-zinc-500 hover:text-red-400 transition"
                          title="Remover corte"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Hook & Payoff Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-gradient-to-r from-amber-950/20 to-[#0d0e15] border border-amber-500/30 rounded-xl space-y-1">
                      <span className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider block">
                        ⚡ Gancho Inicial:
                      </span>
                      <p className="text-zinc-200 font-semibold line-clamp-2 italic">
                        "{cut.hook}"
                      </p>
                    </div>

                    <div className="p-3 bg-[#0d0e15] border border-zinc-800/80 rounded-xl space-y-1">
                      <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
                        🎯 Conclusão / Payoff:
                      </span>
                      <p className="text-zinc-300 font-medium line-clamp-2">
                        {cut.payoff}
                      </p>
                    </div>
                  </div>

                  {/* Why it Virals */}
                  <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/50">
                    <strong className="text-pink-400">Análise de Retenção:</strong> {cut.viralityAnalysis}
                  </p>

                  {/* Action Buttons: Render, Preview, Download MP4, Studio */}
                  <div className="flex items-center gap-2.5 pt-2 flex-wrap">
                    {/* Render button if not yet rendered */}
                    {!isRendered && (
                      <button
                        onClick={() => handleRenderSingleCut(cut)}
                        disabled={isRendering}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-md disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRendering ? 'animate-spin' : ''}`} />
                        <span>{isRendering ? 'Renderizando...' : 'Renderizar Este Corte'}</span>
                      </button>
                    )}

                    {/* Preview Player button */}
                    <button
                      onClick={() => setPreviewingCut(cut)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-bold transition border border-zinc-700"
                    >
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{isRendered ? 'Assistir Prévia (MP4)' : 'Prévia Rápida'}</span>
                    </button>

                    {/* Download MP4 button (Direct download) */}
                    {isRendered && (
                      <a
                        href={cut.downloadUrl || `/api/clips/${cut.id}/download`}
                        download
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-md"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Baixar MP4</span>
                      </a>
                    )}

                    {/* Open in Editor Tab */}
                    <button
                      onClick={() => onOpenCutInEditor(cut)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#7000ff] to-[#ff0055] hover:opacity-95 text-white text-xs font-bold transition"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>

                    <button
                      onClick={() => handleCopyCaption(cut)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition ml-auto ${
                        isCopied
                          ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                          : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? 'Copiada!' : 'Legenda'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Real HTML5 Video Preview Modal (Zero Gray Screen Guarantee) */}
      {previewingCut && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="relative w-full max-w-lg bg-[#0e1017] border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="min-w-0 pr-4">
                <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider">
                  Pré-visualização do Corte
                </span>
                <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
                  {previewingCut.title}
                </h3>
              </div>
              <button
                onClick={() => setPreviewingCut(null)}
                className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player Box */}
            <div className="relative aspect-[9/16] max-h-[500px] mx-auto rounded-2xl overflow-hidden bg-black border border-zinc-800 flex items-center justify-center">
              {previewingCut.renderStatus === 'completed' || previewingCut.previewUrl ? (
                <video
                  src={previewingCut.previewUrl || `/api/clips/${previewingCut.id}/preview`}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-purple-900/30 border border-purple-500/40 text-purple-300 flex items-center justify-center mx-auto">
                    <Scissors className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-white">Este corte ainda não foi renderizado</h4>
                  <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                    Clique em renderizar para gerar o arquivo MP4 vertical 9:16 de alta resolução sem tela cinza.
                  </p>
                  <button
                    onClick={async () => {
                      await handleRenderSingleCut(previewingCut);
                    }}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md"
                  >
                    Renderizar Agora
                  </button>
                </div>
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-zinc-400 font-mono">
                {previewingCut.startTime} → {previewingCut.endTime} ({previewingCut.durationSeconds}s)
              </span>

              <div className="flex items-center gap-2">
                {previewingCut.renderStatus === 'completed' && (
                  <a
                    href={previewingCut.downloadUrl || `/api/clips/${previewingCut.id}/download`}
                    download
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar MP4
                  </a>
                )}
                <button
                  onClick={() => {
                    onOpenCutInEditor(previewingCut);
                    setPreviewingCut(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold transition"
                >
                  Abrir no Editor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
