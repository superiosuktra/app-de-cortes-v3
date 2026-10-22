import React, { useState, useEffect } from 'react';
import {
  Scissors,
  Smartphone,
  Play,
  RotateCcw,
  Sparkles,
  Download,
  Terminal,
  Check,
  Copy,
  AlertTriangle,
  ArrowRight,
  Sliders,
  Type,
  FileText,
  Bookmark,
  ExternalLink,
  Zap,
  Trash2,
  Plus,
  X,
} from 'lucide-react';
import { VideoInfo, ViralCut, VideoFormat, SavedCut, SubtitleTheme } from '../types';
import { ShortsPhonePreview } from './ShortsPhonePreview';
import { FORMAT_OPTIONS, SUBTITLE_THEMES } from '../mockData';
import { authFetch } from '../utils/api';
import confetti from 'canvas-confetti';

interface EditorTabProps {
  videoUrl: string;
  videoInfo: VideoInfo | null;
  viralCuts: ViralCut[];
  selectedCut: ViralCut | null;
  setSelectedCut: (cut: ViralCut | null) => void;
  onSaveCut: (cut: SavedCut) => void;
  onNavigateToPublish: (cut: ViralCut) => void;
  onEnqueueCut?: (cut: ViralCut) => void;
  onClearEditQueue?: () => void;
  onDeleteEditCut?: (cutId: string) => void;
  onAddManualCut?: (cut?: Partial<ViralCut>) => void;
  onRestoreDefaultCuts?: () => void;
}

function parseTimeToSeconds(timeStr: string): number {
  const clean = (timeStr || '').replace(/[\[\]\s]/g, '');
  const parts = clean.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => isNaN(n))) return 0;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function formatSecondsToMMSS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${m.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`;
}

export const EditorTab: React.FC<EditorTabProps> = ({
  videoUrl,
  videoInfo,
  viralCuts,
  selectedCut,
  setSelectedCut,
  onSaveCut,
  onNavigateToPublish,
  onEnqueueCut,
  onClearEditQueue,
  onDeleteEditCut,
  onAddManualCut,
  onRestoreDefaultCuts,
}) => {
  const [startTime, setStartTime] = useState<string>('00:15');
  const [endTime, setEndTime] = useState<string>('01:00');
  const [format, setFormat] = useState<VideoFormat>('speaker_center');
  const [subtitleTheme, setSubtitleTheme] = useState<SubtitleTheme>('none');
  const [overlayTitle, setOverlayTitle] = useState<string>('ESSE MOMENTO MUDOU TUDO 🚨');
  const [customHook, setCustomHook] = useState<string>('');
  const [ffmpegCommand, setFfmpegCommand] = useState<string>('');
  const [isCopiedCommand, setIsCopiedCommand] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isRenderingCut, setIsRenderingCut] = useState<boolean>(false);
  const [renderProgressMsg, setRenderProgressMsg] = useState<string>('');
  const [confirmClearEditQueue, setConfirmClearEditQueue] = useState<boolean>(false);

  // AI Vision Smart Framing State (Opus Clip / Vizard / Klap Standard)
  const [speaker1X, setSpeaker1X] = useState<number>(38);
  const [speaker1Y, setSpeaker1Y] = useState<number>(30);
  const [speaker2X, setSpeaker2X] = useState<number>(62);
  const [speaker2Y, setSpeaker2Y] = useState<number>(30);
  const [zoom, setZoom] = useState<number>(1.0);
  const [aiInsight, setAiInsight] = useState<string>(
    'IA Vision: Enquadramento vertical 9:16 calibrado com respiro natural (Y=30%) e centro perfeito (X=50%) sem poluição visual.'
  );
  const [isAnalyzingFraming, setIsAnalyzingFraming] = useState<boolean>(false);
  const [activeCameraTarget, setActiveCameraTarget] = useState<1 | 2>(2);
  const [activeSceneFrameIdx, setActiveSceneFrameIdx] = useState<1 | 2 | 3>(2);

  // Video ID resolution
  const videoId =
    videoInfo?.videoId ||
    videoUrl.match(/(?:v=|\/v\/|embed\/|youtu\.be\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/)?.[1] ||
    'B57eOqeLVfc';

  // Trigger Gemini Multimodal Vision to detect face coordinates on real scene frames
  const handleDetectAiFraming = async () => {
    setIsAnalyzingFraming(true);
    try {
      const res = await authFetch('/api/analyze-framing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
          videoId,
          videoTitle: videoInfo?.title || overlayTitle,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.speaker1X === 'number') setSpeaker1X(data.speaker1X);
        if (typeof data.speaker1Y === 'number') setSpeaker1Y(data.speaker1Y);
        if (typeof data.speaker2X === 'number') setSpeaker2X(data.speaker2X);
        if (typeof data.speaker2Y === 'number') setSpeaker2Y(data.speaker2Y);
        if (typeof data.zoom === 'number') setZoom(data.zoom);
        if (data.recommendedFormat) setFormat(data.recommendedFormat as VideoFormat);
        if (data.aiInsight) setAiInsight(data.aiInsight);
        confetti({ particleCount: 35, spread: 50, origin: { y: 0.7 } });
      }
    } catch (err) {
      console.warn('Falha ao detectar enquadramento via IA Vision:', err);
    } finally {
      setIsAnalyzingFraming(false);
    }
  };

  const handleDownloadRealCut = async () => {
    setIsRenderingCut(true);
    setRenderProgressMsg('Renderizando Gancho Cold-Open (4s) + Corte 1080p com Legenda Limpa...');
    try {
      const res = await authFetch('/api/download-youtube-cut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
          startTime,
          endTime,
          format,
          subtitleTheme,
          title: overlayTitle,
          hook: customHook,
          subtitles: selectedCut?.overlaySubtitlesSample,
          teaserOffsetSec: selectedCut?.teaserOffsetSec,
          teaserDurationSec: selectedCut?.teaserDurationSec || 4,
          teaserText: selectedCut?.teaserText,
          partBadge: selectedCut?.partBadge,
          framing: {
            speaker1X,
            speaker1Y,
            speaker2X,
            speaker2Y,
            zoom,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(overlayTitle || 'corte_viral').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      confetti({ particleCount: 60, spread: 70 });
    } catch (err: any) {
      alert(`Erro ao processar corte do YouTube: ${err.message}`);
    } finally {
      setIsRenderingCut(false);
      setRenderProgressMsg('');
    }
  };

  // Sync state whenever selectedCut changes
  useEffect(() => {
    if (selectedCut) {
      setStartTime(selectedCut.startTime);
      setEndTime(selectedCut.endTime);
      setOverlayTitle(selectedCut.title || 'MOMENTO VIRAL 🚨');
      setCustomHook(selectedCut.hook || '');
      setFormat(selectedCut.recommendedFormat || 'speaker_center');
      if (selectedCut.subtitleTheme) {
        setSubtitleTheme(selectedCut.subtitleTheme);
      }
      if (selectedCut.framing) {
        setSpeaker1X(selectedCut.framing.speaker1X ?? 38);
        setSpeaker1Y(selectedCut.framing.speaker1Y ?? 30);
        setSpeaker2X(selectedCut.framing.speaker2X ?? 62);
        setSpeaker2Y(selectedCut.framing.speaker2Y ?? 30);
        setZoom(selectedCut.framing.zoom ?? 1.0);
        if (selectedCut.framing.aiInsight) {
          setAiInsight(selectedCut.framing.aiInsight);
        }
      }
    }
  }, [selectedCut]);

  const startSec = parseTimeToSeconds(startTime);
  const endSec = parseTimeToSeconds(endTime);
  const duration = Math.max(0, endSec - startSec);
  const isTooLong = duration > 180;
  const isOptimal = duration >= 25 && duration <= 90;

  // Generate FFmpeg command with exact 9:8 / 9:16 distortion-free AI coordinates
  useEffect(() => {
    const s1x = Number((speaker1X / 100).toFixed(3));
    const s1y = Number((speaker1Y / 100).toFixed(3));
    const s2x = Number((speaker2X / 100).toFixed(3));
    const s2y = Number((speaker2Y / 100).toFixed(3));
    const z = Number(zoom.toFixed(2));
    const fullCh = `trunc(ih/${z}/2)*2`;
    const fullCw = `trunc(ih/${z}*9/16/2)*2`;
    const splitCh = `trunc(ih/${z}/2)*2`;
    const splitCw = `trunc(ih/${z}*9/8/2)*2`;

    let filter = '';
    if (format === 'split_screen') {
      filter = `-filter_complex "[0:v]crop=${splitCw}:${splitCh}:clip(iw*${s2x}-ow/2\\,0\\,iw-ow):clip(ih*${s2y}-oh/2\\,0\\,ih-oh),scale=1080:960:flags=lanczos[top];[0:v]crop=${splitCw}:${splitCh}:clip(iw*${s1x}-ow/2\\,0\\,iw-ow):clip(ih*${s1y}-oh/2\\,0\\,ih-oh),scale=1080:960:flags=lanczos[bot];[top][bot]vstack=inputs=2,drawbox=x=0:y=959:w=1080:h=2:color=black@0.8:t=fill,setsar=1[v]" -map "[v]" -map 0:a?`;
    } else if (format === 'dynamic_reframe') {
      filter = `-filter_complex "[0:v]crop=${fullCw}:${fullCh}:if(lt(mod(t\\,10)\\,5)\\,clip(iw*${s2x}-ow/2\\,0\\,iw-ow)\\,clip(iw*${s1x}-ow/2\\,0\\,iw-ow)):if(lt(mod(t\\,10)\\,5)\\,clip(ih*${s2y}-oh/2\\,0\\,ih-oh)\\,clip(ih*${s1y}-oh/2\\,0\\,ih-oh)),scale=1080:1920:flags=lanczos,setsar=1[v]" -map "[v]" -map 0:a?`;
    } else if (format === 'speaker_left') {
      filter = `-vf "crop=${fullCw}:${fullCh}:clip(iw*${s1x}-ow/2\\,0\\,iw-ow):clip(ih*${s1y}-oh/2\\,0\\,ih-oh),scale=1080:1920:flags=lanczos,setsar=1"`;
    } else if (format === 'speaker_right') {
      filter = `-vf "crop=${fullCw}:${fullCh}:clip(iw*${s2x}-ow/2\\,0\\,iw-ow):clip(ih*${s2y}-oh/2\\,0\\,ih-oh),scale=1080:1920:flags=lanczos,setsar=1"`;
    } else if (format === 'vertical_crop' || format === 'speaker_center') {
      filter = `-vf "crop=${fullCw}:${fullCh}:(iw-ow)/2:clip(ih*0.30-oh/2\\,0\\,ih-oh),scale=1080:1920:flags=lanczos,setsar=1"`;
    } else if (format === 'vertical_blur') {
      filter = `-filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:5[bg];[0:v]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]" -map "[v]" -map 0:a?`;
    } else if (format === 'square') {
      filter = `-vf "crop=min(iw\\,ih):min(iw\\,ih),scale=1080:1080:flags=lanczos,setsar=1"`;
    } else {
      filter = `-c:v copy`;
    }

    const cleanTitle = overlayTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30) || 'corte_viral';
    const cmd = `yt-dlp -f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best" --download-sections "*${startTime}-${endTime}" "${videoUrl || 'https://www.youtube.com/watch?v=' + videoId}" -o "raw.mp4" && ffmpeg -i "raw.mp4" ${filter} -af "highpass=f=80,loudnorm=I=-14:TP=-1.5:LRA=11" -c:v libx264 -preset fast -crf 18 -b:v 6500k -maxrate 9000k -bufsize 14000k -c:a aac -b:a 192k -movflags +faststart "${cleanTitle}.mp4" && rm "raw.mp4"`;
    setFfmpegCommand(cmd);
  }, [startTime, endTime, format, overlayTitle, videoUrl, videoId, speaker1X, speaker1Y, speaker2X, speaker2Y, zoom]);

  const handleAdjustStart = (deltaSeconds: number) => {
    const newSec = Math.max(0, startSec + deltaSeconds);
    setStartTime(formatSecondsToMMSS(newSec));
  };

  const handleAdjustEnd = (deltaSeconds: number) => {
    const newSec = Math.max(startSec + 5, endSec + deltaSeconds);
    setEndTime(formatSecondsToMMSS(newSec));
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(ffmpegCommand);
    setIsCopiedCommand(true);
    setTimeout(() => setIsCopiedCommand(false), 2500);
  };

  const handleSaveToLibrary = () => {
    const newSavedCut: SavedCut = {
      id: `cut-${Date.now()}`,
      videoTitle: videoInfo?.title || 'Vídeo do YouTube',
      videoUrl: videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
      cutTitle: overlayTitle,
      startTime,
      endTime,
      durationSeconds: duration,
      format,
      viralityScore: selectedCut?.viralityScore || 92,
      caption: selectedCut?.caption?.youtube || `${overlayTitle}\n\n#Shorts #Viral`,
      hashtags: selectedCut?.hashtags || ['Shorts', 'Viral', 'Podcast'],
      createdAt: new Date().toLocaleDateString('pt-BR'),
    };

    onSaveCut(newSavedCut);
    setIsSaved(true);
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleDownloadSrt = () => {
    const rawChunks =
      selectedCut?.overlaySubtitlesSample && selectedCut.overlaySubtitlesSample.length > 0
        ? selectedCut.overlaySubtitlesSample
        : ['PRESTE ATENÇÃO', 'ESTE MOMENTO', 'MUDOU TUDO', overlayTitle.slice(0, 20)];

    const chunkDuration = Math.max(1.5, duration / rawChunks.length);
    let srtContent = '';

    rawChunks.forEach((chunk, index) => {
      const chunkStart = index * chunkDuration;
      const chunkEnd = Math.min(duration, (index + 1) * chunkDuration);

      const formatSrtTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
        return `${h}:${m}:${s},${ms}`;
      };

      srtContent += `${index + 1}\n${formatSrtTime(chunkStart)} --> ${formatSrtTime(chunkEnd)}\n${chunk}\n\n`;
    });

    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanTitle = (overlayTitle || 'legendas').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 25);
    a.download = `${cleanTitle}.srt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    confetti({ particleCount: 35, spread: 50 });
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Editing Queue Bar (Fila de Edição) */}
      <div className="bg-[#141520] border border-zinc-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-pink-400" />
            <label className="text-xs font-extrabold text-white">
              Fila de Edição ({viralCuts.length} {viralCuts.length === 1 ? 'corte' : 'cortes'})
            </label>
            <span className="text-[11px] text-zinc-400 hidden sm:inline">
              — Selecione um corte para carregar os tempos ou limpe a fila
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onAddManualCut && (
              <button
                type="button"
                onClick={() =>
                  onAddManualCut({
                    title: overlayTitle || `🔥 [CORTE MANUAL #${viralCuts.length + 1}]`,
                    startTime,
                    endTime,
                    recommendedFormat: format,
                    subtitleTheme,
                    hook: customHook || 'Momento selecionado manualmente no editor',
                  })
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-[11px] font-bold transition"
                title="Adicionar o intervalo atual como um novo corte na fila de edição"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Novo Corte Manual</span>
              </button>
            )}

            {viralCuts.length > 0 && onClearEditQueue && (
              !confirmClearEditQueue ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearEditQueue(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/40 text-red-300 text-[11px] font-bold transition"
                  title="Remover todos os cortes da Fila de Edição"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar Fila de Edição</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-red-950/70 border border-red-500/60 px-2.5 py-1 rounded-xl animate-fadeIn">
                  <span className="text-[11px] font-bold text-red-200">Limpar {viralCuts.length} cortes?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearEditQueue();
                      setConfirmClearEditQueue(false);
                    }}
                    className="px-2 py-0.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-extrabold transition"
                  >
                    Sim, Limpar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearEditQueue(false)}
                    className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold transition"
                  >
                    Cancelar
                  </button>
                </div>
              )
            )}
          </div>
        </div>

        {viralCuts.length > 0 ? (
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {viralCuts.map((cut, idx) => {
              const isSelected = selectedCut?.id === cut.id;
              return (
                <div
                  key={cut.id || idx}
                  className={`flex-shrink-0 rounded-xl text-xs font-bold transition-all flex items-center border ${
                    isSelected
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-pink-400 shadow-md shadow-pink-900/40'
                      : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCut(cut)}
                    className="px-3.5 py-2.5 flex items-center gap-2 text-left"
                  >
                    <span className="w-5 h-5 rounded-full bg-black/40 text-[10px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="truncate max-w-[180px]">{cut.title}</span>
                    <span className={`text-[10px] font-mono ${isSelected ? 'text-pink-100' : 'text-zinc-400'}`}>
                      [{cut.startTime} → {cut.endTime}]
                    </span>
                  </button>
                  {onDeleteEditCut && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteEditCut(cut.id);
                      }}
                      className={`mr-2 p-1 rounded-lg transition ${
                        isSelected
                          ? 'hover:bg-black/30 text-white/80 hover:text-white'
                          : 'hover:bg-red-950/60 text-zinc-500 hover:text-red-400'
                      }`}
                      title="Remover este corte da fila de edição"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 px-3.5 rounded-xl bg-[#0e0f17] border border-zinc-800/80 text-xs text-zinc-400">
            <span>
              Fila de edição limpa! Você pode ajustar os tempos livremente abaixo, analisar um novo vídeo na aba 1 ou criar cortes manuais.
            </span>
            {onRestoreDefaultCuts && (
              <button
                type="button"
                onClick={onRestoreDefaultCuts}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restaurar Cortes de Exemplo</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Grid: Controls & Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Editor Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-[#141520] border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-6">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Ajuste Fino do Corte</h3>
                  <p className="text-xs text-zinc-400">Configure os tempos, formato e título de overlay</p>
                </div>
              </div>

              {/* Duration Status Tag */}
              <div
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                  isTooLong
                    ? 'bg-red-950/40 border-red-500/40 text-red-300'
                    : isOptimal
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                }`}
              >
                <span>Duração: {duration}s</span>
                {isTooLong && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
              </div>
            </div>

            {/* Warning if video exceeds 180s (from Colab script) */}
            {isTooLong && (
              <div className="flex items-start gap-2.5 p-3.5 bg-red-950/30 border border-red-600/40 rounded-2xl text-xs text-red-300">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Atenção:</strong> O trecho tem mais de 3 minutos ({duration} segundos). O algoritmo do YouTube não o classificará como Short vertical e ele pode perder a entrega orgânica rápida. Reduza o tempo para menos de 90s para máxima viralidade.
                </p>
              </div>
            )}

            {/* Time Adjustments Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Start Time Box */}
              <div className="p-4 bg-[#0e0f17] border border-zinc-800 rounded-2xl space-y-2">
                <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                  <span>Tempo Inicial</span>
                  <span className="text-[10px] text-zinc-500 font-mono">MM:SS</span>
                </label>
                <input
                  type="text"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  placeholder="00:15"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-base font-mono font-bold text-white focus:outline-none focus:border-purple-500 text-center"
                />
                <div className="flex gap-1.5 pt-1">
                  <button
                    onClick={() => handleAdjustStart(-5)}
                    className="flex-1 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-300 transition"
                  >
                    -5s
                  </button>
                  <button
                    onClick={() => handleAdjustStart(-1)}
                    className="flex-1 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-300 transition"
                  >
                    -1s
                  </button>
                  <button
                    onClick={() => handleAdjustStart(1)}
                    className="flex-1 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-300 transition"
                  >
                    +1s
                  </button>
                  <button
                    onClick={() => handleAdjustStart(5)}
                    className="flex-1 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-300 transition"
                  >
                    +5s
                  </button>
                </div>
              </div>

              {/* End Time Box */}
              <div className="p-4 bg-[#0e0f17] border border-zinc-800 rounded-2xl space-y-2">
                <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                  <span>Tempo Final</span>
                  <span className="text-[10px] text-zinc-500 font-mono">MM:SS</span>
                </label>
                <input
                  type="text"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  placeholder="01:00"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-base font-mono font-bold text-white focus:outline-none focus:border-purple-500 text-center"
                />
                <div className="flex gap-1.5 pt-1">
                  <button
                    onClick={() => handleAdjustEnd(-5)}
                    className="flex-1 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-300 transition"
                  >
                    -5s
                  </button>
                  <button
                    onClick={() => handleAdjustEnd(-1)}
                    className="flex-1 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-300 transition"
                  >
                    -1s
                  </button>
                  <button
                    onClick={() => handleAdjustEnd(1)}
                    className="flex-1 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-300 transition"
                  >
                    +1s
                  </button>
                  <button
                    onClick={() => handleAdjustEnd(5)}
                    className="flex-1 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-semibold text-zinc-300 transition"
                  >
                    +5s
                  </button>
                </div>
              </div>
            </div>

            {/* Video Format Selector */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>Formato de Conversão de Vídeo</span>
                <span className="text-[10px] text-pink-400">Compatível com FFmpeg</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setFormat(opt.id as VideoFormat)}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      format === opt.id
                        ? 'bg-gradient-to-r from-purple-900/40 to-pink-900/40 border-pink-500 text-white shadow-md shadow-pink-950/40'
                        : 'bg-[#0e0f17] border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">{opt.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold">
                        {opt.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive 16:9 AI Vision Framing Monitor (Opus Clip / Vizard.ai / Klap Standard) */}
            <div className="p-4 sm:p-5 bg-[#0c0d14] border border-purple-500/30 rounded-2xl space-y-4 shadow-inner">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-pink-400" />
                    Radar IA Vision: Detecção Facial & Proporção Real 1:1 (Sem Distorção)
                  </span>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Clique na imagem 16:9 abaixo para posicionar exatamente a Câmera 1 (Host) ou Câmera 2 (Convidado), ou peça para a IA detectar os rostos nos quadros do vídeo.
                  </p>
                </div>

                <button
                  onClick={handleDetectAiFraming}
                  disabled={isAnalyzingFraming}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white text-xs font-bold shadow-md shadow-purple-950/50 transition disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAnalyzingFraming ? 'animate-spin' : ''}`} />
                  <span>{isAnalyzingFraming ? 'Analisando Quadros com IA...' : '🤖 IA: Auto-Detectar Rostos'}</span>
                </button>
              </div>

              {/* AI Insight Banner */}
              <div className="px-3 py-2 rounded-xl bg-purple-950/30 border border-purple-500/20 text-[11px] text-purple-200 flex items-center justify-between gap-2">
                <span>{aiInsight}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {[1, 2, 3].map((frameNum) => (
                    <button
                      key={frameNum}
                      onClick={() => setActiveSceneFrameIdx(frameNum as 1 | 2 | 3)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                        activeSceneFrameIdx === frameNum
                          ? 'bg-pink-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                      title={`Ver quadro real da cena ${frameNum} do vídeo`}
                    >
                      Cena {frameNum}
                    </button>
                  ))}
                </div>
              </div>

              {/* 16:9 Widescreen Interactive Studio Monitor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 font-semibold">Clique no quadro para mover:</span>
                    <button
                      onClick={() => setActiveCameraTarget(1)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition border ${
                        activeCameraTarget === 1
                          ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      🎯 Câmera 1 (Host • X:{speaker1X}%)
                    </button>
                    <button
                      onClick={() => setActiveCameraTarget(2)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition border ${
                        activeCameraTarget === 2
                          ? 'bg-yellow-950/80 border-yellow-400 text-yellow-300 shadow'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      🎯 Câmera 2 (Convidado • X:{speaker2X}%)
                    </button>
                  </div>
                  <span className="text-zinc-500 font-mono hidden sm:inline">Zoom: {zoom.toFixed(2)}x</span>
                </div>

                {/* Clickable 16:9 Frame Canvas */}
                <div
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = Math.round(((e.clientX - rect.left) / rect.width) * 100);
                    const clickY = Math.round(((e.clientY - rect.top) / rect.height) * 100);
                    const clampedX = Math.max(15, Math.min(85, clickX));
                    const clampedY = Math.max(20, Math.min(80, clickY));
                    if (activeCameraTarget === 1) {
                      setSpeaker1X(clampedX);
                      setSpeaker1Y(clampedY);
                    } else {
                      setSpeaker2X(clampedX);
                      setSpeaker2Y(clampedY);
                    }
                  }}
                  className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-zinc-800 hover:border-purple-500/60 cursor-crosshair bg-black select-none shadow-lg group"
                  title="Clique em cima do rosto do participante para centralizar a câmera instantaneamente"
                >
                  <img
                    src={`https://img.youtube.com/vi/${videoId}/${activeSceneFrameIdx}.jpg`}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        videoInfo?.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    }}
                    alt="Quadro 16:9 do Vídeo"
                    className="w-full h-full object-cover opacity-90"
                  />

                  {/* Subtle Rule-of-Thirds Grid */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                    <div className="border-r border-b border-white/10" />
                    <div className="border-r border-b border-white/10" />
                    <div className="border-b border-white/10" />
                    <div className="border-r border-b border-white/10" />
                    <div className="border-r border-b border-white/10" />
                    <div className="border-b border-white/10" />
                  </div>

                  {/* Camera 1 (Host - Left) Crop Box Indicator */}
                  <div
                    style={{
                      left: `${speaker1X}%`,
                      top: `${speaker1Y}%`,
                      width: `${Math.round(38 / zoom)}%`,
                      height: `${Math.round(76 / zoom)}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    className={`absolute border-2 rounded-xl pointer-events-none transition-all duration-150 flex flex-col justify-between p-1.5 ${
                      activeCameraTarget === 1
                        ? 'border-cyan-400 bg-cyan-400/15 shadow-[0_0_15px_rgba(34,211,238,0.5)] z-20'
                        : 'border-cyan-400/70 bg-cyan-400/5 z-10'
                    }`}
                  >
                    <span className="px-1.5 py-0.5 rounded bg-black/85 text-cyan-300 text-[9px] font-black w-fit">
                      CÂM 1 (HOST) • {speaker1X}%
                    </span>
                    <div className="w-2 h-2 rounded-full bg-cyan-400 self-center" />
                    <span className="text-[8px] font-mono text-cyan-200/80 bg-black/60 px-1 rounded self-end">
                      9:8 / 9:16
                    </span>
                  </div>

                  {/* Camera 2 (Guest - Right) Crop Box Indicator */}
                  <div
                    style={{
                      left: `${speaker2X}%`,
                      top: `${speaker2Y}%`,
                      width: `${Math.round(38 / zoom)}%`,
                      height: `${Math.round(76 / zoom)}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    className={`absolute border-2 rounded-xl pointer-events-none transition-all duration-150 flex flex-col justify-between p-1.5 ${
                      activeCameraTarget === 2
                        ? 'border-yellow-400 bg-yellow-400/15 shadow-[0_0_15px_rgba(250,204,21,0.5)] z-20'
                        : 'border-yellow-400/70 bg-yellow-400/5 z-10'
                    }`}
                  >
                    <span className="px-1.5 py-0.5 rounded bg-black/85 text-yellow-300 text-[9px] font-black w-fit">
                      CÂM 2 (CONVIDADO) • {speaker2X}%
                    </span>
                    <div className="w-2 h-2 rounded-full bg-yellow-400 self-center" />
                    <span className="text-[8px] font-mono text-yellow-200/80 bg-black/60 px-1 rounded self-end">
                      9:8 / 9:16
                    </span>
                  </div>
                </div>
              </div>

              {/* Fine-tune Sliders & Studio Presets */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-cyan-400">Posição Câmera 1 (Esq)</span>
                    <span className="text-white font-mono">{speaker1X}%</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={85}
                    value={speaker1X}
                    onChange={(e) => setSpeaker1X(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                </div>

                <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-yellow-400">Posição Câmera 2 (Dir)</span>
                    <span className="text-white font-mono">{speaker2X}%</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={85}
                    value={speaker2X}
                    onChange={(e) => setSpeaker2X(Number(e.target.value))}
                    className="w-full accent-yellow-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                </div>

                <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-pink-400">Zoom Óptico Sem Distorção</span>
                    <span className="text-white font-mono">{zoom.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={1.6}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full accent-pink-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                </div>
              </div>

              {/* Quick Studio Calibration Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-zinc-400 font-semibold mr-1">Presets Rápidos:</span>
                <button
                  onClick={() => {
                    setSpeaker1X(50);
                    setSpeaker1Y(30);
                    setSpeaker2X(50);
                    setSpeaker2Y(30);
                    setZoom(1.0);
                    setFormat('speaker_center');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-purple-900/60 hover:bg-purple-800 border border-purple-500/40 text-[10px] font-bold text-purple-200 transition"
                >
                  🎯 Solo Centralizado (50% • 9:16)
                </button>
                <button
                  onClick={() => {
                    setSpeaker1X(38);
                    setSpeaker1Y(30);
                    setSpeaker2X(62);
                    setSpeaker2Y(30);
                    setZoom(1.0);
                    setFormat('split_screen');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-bold text-zinc-200 transition"
                >
                  🎙️ Mesa Podcast Dupla (38% / 62%)
                </button>
                <button
                  onClick={() => {
                    setSpeaker1X(34);
                    setSpeaker1Y(30);
                    setSpeaker2X(66);
                    setSpeaker2Y(30);
                    setZoom(1.0);
                    setFormat('split_screen');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-bold text-zinc-200 transition"
                >
                  👥 Sofá / Dupla (34% / 66%)
                </button>
                <button
                  onClick={() => {
                    setSpeaker1X(38);
                    setSpeaker1Y(30);
                    setSpeaker2X(62);
                    setSpeaker2Y(30);
                    setZoom(1.0);
                    setFormat('dynamic_reframe');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-bold text-zinc-200 transition"
                >
                  🔄 Auto-Reframe IA (38/62)
                </button>
              </div>
            </div>

            {/* Subtitle Theme Customizer (Hormozi / Submagic / MrBeast) */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                  Estilo Visual de Legendas Virais (Submagic / Alex Hormozi)
                </span>
                <span className="text-[10px] text-zinc-400">Animação palavra por palavra</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {SUBTITLE_THEMES.map((th) => (
                  <button
                    key={th.id}
                    onClick={() => setSubtitleTheme(th.id as SubtitleTheme)}
                    className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 ${
                      subtitleTheme === th.id
                        ? 'bg-zinc-800 border-yellow-400 shadow-md shadow-yellow-900/20'
                        : 'bg-[#0e0f17] border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div
                      className="w-5 h-5 rounded-full border border-black/50 shadow flex items-center justify-center"
                      style={{ backgroundColor: th.color }}
                    >
                      {subtitleTheme === th.id && <span className="text-[10px] text-black font-black">✓</span>}
                    </div>
                    <span className="text-xs font-bold text-white mt-0.5">{th.name}</span>
                    <span className="text-[9px] text-zinc-400 line-clamp-1 leading-tight">{th.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cold-Open Climax Hook & Video Metadata Title */}
            <div className="space-y-3 p-4 bg-gradient-to-r from-amber-950/30 via-[#0e0f17] to-purple-950/30 border border-amber-500/30 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Opção 3 Ativa: Gancho Cold-Open Clímax (00:00–00:04) + Tela Zero Poluição
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black">
                  {selectedCut?.partBadge || 'PARTE 1'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-300 leading-relaxed">
                O vídeo renderizado começa com os <strong>4 segundos mais explosivos do próprio corte</strong> (
                <code className="text-amber-300 font-mono">
                  {selectedCut?.teaserStartTime || startTime} → {selectedCut?.teaserEndTime || endTime}
                </code>
                : <em>"{selectedCut?.teaserText || customHook || overlayTitle}"</em>) antes de tocar a história completa, com legenda dinâmica limpa de <strong>2 palavras</strong> sem caixas cobrindo o rosto.
              </p>

              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-yellow-400" />
                    Título do Vídeo (Para o Post no YouTube / TikTok / Reels — Não polui a tela)
                  </span>
                </label>
                <input
                  type="text"
                  value={overlayTitle}
                  onChange={(e) => setOverlayTitle(e.target.value)}
                  placeholder="Ex: 🔥 [PARTE 1] O SEGREDO DA DISCIPLINA..."
                  className="w-full px-3.5 py-2.5 bg-[#0e0f17] border border-zinc-800 rounded-xl text-sm font-bold text-yellow-400 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={handleSaveToLibrary}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-bold transition shadow-sm"
              >
                {isSaved ? <Check className="w-4 h-4 text-emerald-400" /> : <Bookmark className="w-4 h-4 text-pink-400" />}
                <span>{isSaved ? 'Salvo na Biblioteca!' : 'Salvar Corte na Biblioteca'}</span>
              </button>

              <button
                onClick={handleDownloadRealCut}
                disabled={isRenderingCut}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-200 hover:text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                title="Baixar o arquivo de vídeo MP4 cortado em 9:16 diretamente do YouTube"
              >
                <Download className={`w-4 h-4 text-emerald-400 ${isRenderingCut ? 'animate-bounce' : ''}`} />
                <span>{isRenderingCut ? (renderProgressMsg || 'Processando...') : 'Baixar Corte Real (MP4)'}</span>
              </button>

              <button
                onClick={handleDownloadSrt}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-750 border border-cyan-500/30 text-cyan-200 hover:text-white text-xs font-bold transition shadow-sm"
                title="Baixar arquivo de legendas (.SRT) para importar no CapCut, Premiere ou DaVinci Resolve"
              >
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Baixar Legendas (.SRT)</span>
              </button>

              {onEnqueueCut && (
                <button
                  onClick={() => {
                    const cutToEnqueue: ViralCut = selectedCut || {
                      id: `cut-${Date.now()}`,
                      title: overlayTitle,
                      startTime,
                      endTime,
                      startSeconds: startSec,
                      endSeconds: endSec,
                      durationSeconds: duration,
                      viralityScore: 94,
                      hook: customHook || overlayTitle,
                      payoff: 'Conclusão forte',
                      neuromarketingTrigger: 'Curiosidade',
                      viralityAnalysis: 'Trecho personalizado no editor 9:16',
                      recommendedFormat: format,
                      framing: { speaker1X, speaker1Y, speaker2X, speaker2Y, zoom, aiInsight },
                      caption: {
                        youtube: `${overlayTitle}\n\nAssista até o fim para entender! #Shorts`,
                        instagram: `${overlayTitle}\n\nComente sua opinião abaixo! 👇`,
                        tiktok: `${overlayTitle} 🤯 #fyp #viral`,
                      },
                      hashtags: ['Shorts', 'Viral', 'Podcasts', 'Motivação'],
                    };
                    onEnqueueCut(cutToEnqueue);
                    confetti({ particleCount: 40, spread: 50 });
                  }}
                  className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-purple-900/60 hover:bg-purple-900/90 border border-purple-500/40 text-purple-200 hover:text-white text-xs font-bold transition shadow-sm"
                  title="Adicionar este corte diretamente à fila de postagem automática"
                >
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span>+ Fila de Auto-Post</span>
                </button>
              )}

              <button
                onClick={() => {
                  if (selectedCut) {
                    onNavigateToPublish({
                      ...selectedCut,
                      recommendedFormat: format,
                      framing: { speaker1X, speaker1Y, speaker2X, speaker2Y, zoom, aiInsight },
                    });
                  } else {
                    onNavigateToPublish({
                      id: `cut-${Date.now()}`,
                      title: overlayTitle,
                      startTime,
                      endTime,
                      startSeconds: startSec,
                      endSeconds: endSec,
                      durationSeconds: duration,
                      viralityScore: 94,
                      hook: customHook || overlayTitle,
                      payoff: 'Conclusão forte',
                      neuromarketingTrigger: 'Curiosidade',
                      viralityAnalysis: 'Trecho otimizado para retenção',
                      recommendedFormat: format,
                      framing: { speaker1X, speaker1Y, speaker2X, speaker2Y, zoom, aiInsight },
                      caption: {
                        youtube: `${overlayTitle}\n\nAssista até o fim para entender! #Shorts`,
                        instagram: `${overlayTitle}\n\nComente sua opinião abaixo! 👇`,
                        tiktok: `${overlayTitle} 🤯 #fyp #viral`,
                      },
                      hashtags: ['Shorts', 'Viral', 'Podcasts', 'Motivação'],
                    });
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#7000ff] to-[#ff0055] text-white text-xs font-bold shadow-lg shadow-purple-900/40 hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] transition"
              >
                <span>Avançar para Publicação & Legendas</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* FFmpeg Code Snippet Card (Identical to Colab command) */}
          <div className="bg-[#12131d] border border-zinc-800 rounded-3xl p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Comando de Renderização FFmpeg (Alta Definição Sem Distorção)
                </h4>
              </div>
              <button
                onClick={handleCopyCommand}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] font-semibold transition"
              >
                {isCopiedCommand ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopiedCommand ? 'Copiado!' : 'Copiar Comando'}</span>
              </button>
            </div>
            
            <p className="text-[11px] text-zinc-400">
              Caso deseje renderizar o corte no seu computador localmente em 4K/1080p usando FFmpeg e yt-dlp:
            </p>

            <div className="p-3 bg-black/80 rounded-xl border border-zinc-800/80 font-mono text-[11px] text-emerald-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
              {ffmpegCommand}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive 9:16 Smartphone Simulator (5 cols) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-3 px-2">
            <span className="text-xs font-extrabold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-pink-400" />
              Simulador Vertical (Tela Limpa • 2 Palavras)
            </span>
            <span className="text-[10px] text-emerald-400 font-bold">Opção 3 Ativa ✓</span>
          </div>

          <ShortsPhonePreview
            videoId={videoId}
            videoUrl={videoUrl}
            thumbnailUrl={videoInfo?.thumbnail}
            channelName={videoInfo?.author || 'cortes_virais'}
            startSeconds={startSec}
            endSeconds={endSec}
            format={format}
            subtitleTheme={subtitleTheme}
            showSubtitles={subtitleTheme !== 'none'}
            activeSpeaker={selectedCut?.activeSpeaker}
            overlayTitle={overlayTitle}
            partBadge={selectedCut?.partBadge}
            hook={customHook}
            subtitles={selectedCut?.overlaySubtitlesSample || ['ARMA PODEROSA', 'SEJA COMPETITIVO', 'NUNCA ACOMODE']}
            teaserOffsetSec={selectedCut?.teaserOffsetSec}
            teaserDurationSec={selectedCut?.teaserDurationSec || 4}
            teaserText={selectedCut?.teaserText}
            retentionStrategyOption={selectedCut?.retentionStrategyOption || 3}
            speaker1X={speaker1X}
            speaker1Y={speaker1Y}
            speaker2X={speaker2X}
            speaker2Y={speaker2Y}
            zoom={zoom}
          />
        </div>

      </div>
    </div>
  );
};
