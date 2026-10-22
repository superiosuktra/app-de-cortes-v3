import React, { useState, useEffect } from 'react';
import {
  Clock,
  Play,
  Pause,
  Zap,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Youtube,
  Instagram,
  Settings2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  Sliders,
  Send,
  Eye,
  Key,
  Bot,
  FastForward,
  Check,
} from 'lucide-react';
import { QueueItem, AutoPostSettings, PlatformCredentials, SocialPlatform } from '../types';

export interface AutoBotStatus {
  isRunning: boolean;
  step: 0 | 1 | 2 | 3 | 4;
  message: string;
  chosenVideoTitle?: string;
  chosenVideoUrl?: string;
  cutsGenerated?: number;
  logs: string[];
}

interface AutoPostQueueManagerProps {
  queue: QueueItem[];
  settings: AutoPostSettings;
  onUpdateSettings: (newSettings: Partial<AutoPostSettings>) => void;
  onUpdateItem: (id: string, updates: Partial<QueueItem>) => void;
  onDeleteItem: (id: string) => void;
  onClearCompleted: () => void;
  onClearAll: () => void;
  onPostItemNow: (id: string) => Promise<void>;
  onTriggerNextNow: () => Promise<void>;
  onToggleQueueActive: (active: boolean) => void;
  credentials: PlatformCredentials;
  onOpenApiModal: () => void;
  onSwitchToDemoAndPost?: (id: string) => Promise<void>;
  onStartAutoBot?: (customNiche?: string) => Promise<void>;
  autoBotStatus?: AutoBotStatus | null;
  onSkipWaitAndPostNow?: (id?: string) => Promise<void>;
  onRescheduleEvery5Minutes?: () => void;
}

export const AutoPostQueueManager: React.FC<AutoPostQueueManagerProps> = ({
  queue,
  settings,
  onUpdateSettings,
  onDeleteItem,
  onClearCompleted,
  onClearAll,
  onPostItemNow,
  onTriggerNextNow,
  onToggleQueueActive,
  credentials,
  onOpenApiModal,
  onSwitchToDemoAndPost,
  onStartAutoBot,
  autoBotStatus,
  onSkipWaitAndPostNow,
  onRescheduleEvery5Minutes,
}) => {
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [isProcessingManual, setIsProcessingManual] = useState<string | null>(null);
  const [botNiche, setBotNiche] = useState<string>('Podcasts & Cortes Virais em Alta');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);

  // Real-time 1-second ticker so the 5-minute countdown clock ticks live!
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const pendingItems = queue.filter((i) => i.status === 'pending');
  const postingItems = queue.filter((i) => i.status === 'posting');
  const publishedItems = queue.filter((i) => i.status === 'published');
  const nextItem = pendingItems[0];

  const getCountdownInfo = (isoString: string) => {
    try {
      const targetMs = new Date(isoString).getTime();
      const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      const digital = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      const timeStr = new Date(isoString).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const totalWindowSec = (settings.intervalMinutes || 5) * 60;
      const progressPct = Math.min(100, Math.max(5, 100 - (diffSec / totalWindowSec) * 100));

      return {
        diffSec,
        mins,
        secs,
        digital,
        timeStr,
        progressPct,
        isDue: diffSec <= 0,
      };
    } catch {
      return {
        diffSec: 0,
        mins: 0,
        secs: 0,
        digital: '00:00',
        timeStr: '--:--',
        progressPct: 100,
        isDue: true,
      };
    }
  };

  const handlePostNow = async (id: string) => {
    setIsProcessingManual(id);
    try {
      if (onSkipWaitAndPostNow) {
        await onSkipWaitAndPostNow(id);
      } else {
        await onPostItemNow(id);
      }
    } finally {
      setIsProcessingManual(null);
    }
  };

  const nextCountdown = nextItem ? getCountdownInfo(nextItem.scheduledFor) : null;

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* 1. BOT AUTOMÁTICO 100% (ESCOLHA DO VÍDEO -> CORTES -> POST 5 EM 5 MIN) */}
      {/* ===================================================================== */}
      <div className="bg-gradient-to-r from-[#0f1f1c] via-[#131d2b] to-[#1d142b] border-2 border-emerald-500/40 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
              <span>MODO PILOTO AUTOMÁTICO 100% • DE 5 EM 5 MINUTOS</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Bot Automático: Escolhe o Vídeo, Faz os Cortes e Posta Sozinho
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Aperte um único botão abaixo: o Bot busca um vídeo em alta no YouTube, analisa o enquadramento facial com IA, gera vários cortes virais e agenda cada vídeo na fila com <strong>5 minutos de diferença</strong> (disparando o 1º imediatamente!).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <select
              value={botNiche}
              onChange={(e) => setBotNiche(e.target.value)}
              disabled={autoBotStatus?.isRunning}
              className="px-3.5 py-3 rounded-2xl bg-[#0b0d14] border border-zinc-700 text-xs font-bold text-white focus:outline-none focus:border-emerald-400"
            >
              <option value="Podcasts & Cortes Virais em Alta">🔥 Tema: Podcasts & Cortes em Alta</option>
              <option value="Finanças Investimentos Riqueza Podcast">💰 Tema: Finanças, Dinheiro & Negócios</option>
              <option value="Neurociência Dopamina Disciplina Podcast">🧠 Tema: Neurociência, Foco & Mindset</option>
              <option value="Inteligência Artificial Tecnologia Futuro Podcast">🤖 Tema: Inteligência Artificial & Tech</option>
              <option value="Histórias Curiosidades Polêmicas Podcast">⚡ Tema: Curiosidades & Debates Virais</option>
            </select>

            <button
              type="button"
              disabled={Boolean(autoBotStatus?.isRunning)}
              onClick={() => onStartAutoBot && onStartAutoBot(botNiche)}
              className="flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 hover:brightness-110 text-zinc-950 font-black text-xs sm:text-sm shadow-xl shadow-emerald-950/60 hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-60"
            >
              {autoBotStatus?.isRunning ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin text-zinc-950" />
                  <span>Executando Bot Automático...</span>
                </>
              ) : (
                <>
                  <Bot className="w-5 h-5 text-zinc-950" />
                  <span>🚀 INICIAR BOT AUTOMÁTICO (1 CLIQUE)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 4-Step Visual Progress Tracker for the Autonomous Bot */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 mt-5 pt-4 border-t border-white/10">
          {[
            { step: 1, title: '1. Escolher Vídeo Viral', desc: 'Busca vídeo inédito em alta' },
            { step: 2, title: '2. Enquadramento & Áudio IA', desc: 'Rastreia rosto de quem fala' },
            { step: 3, title: '3. Múltiplos Cortes 9:16', desc: 'Gera 6 a 8 cortes com copy' },
            { step: 4, title: '4. Postar de 5 em 5 Min', desc: 'Fila automática + Post no canal' },
          ].map((s) => {
            const currentStep = autoBotStatus?.step || 0;
            const isDone = currentStep > s.step || (currentStep === 4 && !autoBotStatus?.isRunning);
            const isCurrent = autoBotStatus?.isRunning && currentStep === s.step;

            return (
              <div
                key={s.step}
                className={`p-3 rounded-2xl border transition flex items-center gap-3 ${
                  isCurrent
                    ? 'bg-emerald-950/60 border-emerald-400 text-white shadow-lg shadow-emerald-950/40'
                    : isDone
                    ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200'
                    : 'bg-black/30 border-zinc-800/80 text-zinc-400'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                    isCurrent
                      ? 'bg-emerald-400 text-zinc-950 animate-pulse'
                      : isDone
                      ? 'bg-emerald-500/30 text-emerald-300'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {isDone ? <Check className="w-4 h-4" /> : isCurrent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : s.step}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{s.title}</div>
                  <div className="text-[10px] opacity-80 truncate">{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Bot Status Message & Logs */}
        {autoBotStatus && (autoBotStatus.isRunning || autoBotStatus.logs.length > 0) && (
          <div className="mt-4 p-3.5 rounded-2xl bg-black/50 border border-emerald-500/30 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-emerald-300 flex items-center gap-2">
                {autoBotStatus.isRunning ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
                <span>{autoBotStatus.message}</span>
              </span>
              {autoBotStatus.chosenVideoTitle && (
                <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 text-[11px] font-semibold truncate max-w-md">
                  🎬 Vídeo escolhido: {autoBotStatus.chosenVideoTitle}
                </span>
              )}
            </div>
            {autoBotStatus.logs.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-zinc-400 font-mono">
                {autoBotStatus.logs.slice(-4).map((l, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded bg-zinc-900/90 border border-zinc-800">
                    {l}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 2. PAINEL DE ESPERA EM TEMPO REAL (5 MIN) + BOTÃO PULAR ESPERA        */}
      {/* ===================================================================== */}
      {(nextItem || postingItems.length > 0) && (
        <div className="bg-gradient-to-r from-[#1e1233] via-[#271338] to-[#2e1129] border-2 border-pink-500/50 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-4">
              {/* Digital Countdown Box */}
              <div className="px-4 py-3 rounded-2xl bg-black/70 border border-pink-500/40 text-center min-w-[115px] shadow-inner">
                <span className="text-[10px] font-bold uppercase tracking-wider text-pink-400 block">
                  {postingItems.length > 0 ? 'TRANSMITINDO' : 'PRÓXIMO POST EM'}
                </span>
                <span className="text-2xl sm:text-3xl font-black font-mono text-white tracking-wider">
                  {postingItems.length > 0 ? 'AO VIVO' : nextCountdown?.digital || '00:00'}
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-pink-500/20 text-pink-300 border border-pink-500/30">
                    {postingItems.length > 0 ? '🚀 ENVIANDO PARA O YOUTUBE AGORA' : `⏳ AGUARDANDO NA FILA (${settings.intervalMinutes} MIN DE INTERVALO)`}
                  </span>
                  {nextItem && (
                    <span className="text-[11px] text-zinc-400 font-mono">
                      Programado para {nextCountdown?.timeStr}
                    </span>
                  )}
                </div>

                <h4 className="text-base sm:text-lg font-black text-white">
                  {postingItems[0]?.cutTitle || nextItem?.cutTitle}
                </h4>

                <p className="text-xs text-zinc-300 line-clamp-1">
                  🎬 Origem: {postingItems[0]?.videoTitle || nextItem?.videoTitle} • Trecho: {postingItems[0]?.startTime || nextItem?.startTime} até {postingItems[0]?.endTime || nextItem?.endTime}
                </p>
              </div>
            </div>

            {/* MAIN USER REQUEST BUTTON: Pular Tempo de Espera e Postar de Uma Vez */}
            {nextItem && (
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handlePostNow(nextItem.id)}
                  disabled={Boolean(isProcessingManual) || postingItems.length > 0}
                  className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#ff0055] via-pink-600 to-orange-500 hover:brightness-110 text-white font-black text-xs sm:text-sm shadow-xl shadow-pink-950/60 hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50"
                >
                  <FastForward className="w-5 h-5 fill-white" />
                  <span>
                    {isProcessingManual === nextItem.id
                      ? 'Postando Vídeo Agora...'
                      : '⏭️ PULAR TEMPO DE ESPERA E POSTAR DE UMA VEZ'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Progress bar of the 5-minute wait */}
          {nextItem && nextCountdown && postingItems.length === 0 && (
            <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-emerald-400 transition-all duration-1000"
                style={{ width: `${nextCountdown.progressPct}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. CONTROLE GERAL DA FILA & MÉTRICAS                                  */}
      {/* ===================================================================== */}
      <div className="bg-gradient-to-r from-[#141525] via-[#191a2d] to-[#161426] border border-purple-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 text-white shadow-lg shadow-pink-900/40">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white tracking-tight">
                  Fila Aguardando Postagem
                </h3>
                <span
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    settings.isActive
                      ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                      : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      settings.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  {settings.isActive ? `Ativa (1 post a cada ${settings.intervalMinutes} min)` : 'Fila Pausada'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Gerencie a ordem dos cortes, acompanhe o cronômetro ou pule a espera de qualquer vídeo
              </p>
            </div>
          </div>

          {/* Master Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {onRescheduleEvery5Minutes && pendingItems.length > 0 && (
              <button
                type="button"
                onClick={onRescheduleEvery5Minutes}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-950/60 hover:bg-purple-900/70 border border-purple-500/40 text-purple-200 text-xs font-bold transition"
                title="Alinha todos os vídeos pendentes com exatamente 5 minutos de diferença entre cada um"
              >
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>Alinhar Fila (5 em 5 min)</span>
              </button>
            )}

            <button
              onClick={() => onToggleQueueActive(!settings.isActive)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition shadow-lg ${
                settings.isActive
                  ? 'bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
              }`}
            >
              {settings.isActive ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pausar Fila</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Retomar Fila</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-200 text-xs font-semibold transition"
            >
              <Settings2 className="w-4 h-4 text-purple-400" />
              <span>Intervalo ({settings.intervalMinutes}m)</span>
              {showSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-zinc-800/80">
          <div className="bg-[#0e0f17]/80 border border-zinc-800/80 rounded-2xl p-3">
            <span className="text-[11px] text-zinc-400 font-medium">Total na Fila</span>
            <div className="text-xl font-black text-white mt-0.5">{queue.length}</div>
          </div>

          <div className="bg-[#0e0f17]/80 border border-zinc-800/80 rounded-2xl p-3">
            <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Aguardando Postagem
            </span>
            <div className="text-xl font-black text-amber-300 mt-0.5">{pendingItems.length}</div>
          </div>

          <div className="bg-[#0e0f17]/80 border border-zinc-800/80 rounded-2xl p-3">
            <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Publicados com Sucesso
            </span>
            <div className="text-xl font-black text-emerald-300 mt-0.5">{publishedItems.length}</div>
          </div>

          <div className="bg-[#0e0f17]/80 border border-zinc-800/80 rounded-2xl p-3">
            <span className="text-[11px] text-zinc-400 font-medium">Intervalo Entre Vídeos</span>
            <div className="text-xl font-black text-emerald-400 mt-0.5">{settings.intervalMinutes} minutos</div>
          </div>
        </div>
      </div>

      {/* Settings Panel (Collapsible) */}
      {showSettings && (
        <div className="bg-[#141520] border border-purple-500/40 rounded-3xl p-6 shadow-xl space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-purple-400" />
              <h4 className="text-sm font-bold text-white">Configurações de Postagem Automática</h4>
            </div>
            <span className="text-xs text-zinc-400">Salvo automaticamente</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-[#0d0e15] border border-purple-500/30 rounded-2xl space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoEnqueueOnGenerate}
                  onChange={(e) => onUpdateSettings({ autoEnqueueOnGenerate: e.target.checked })}
                  className="w-5 h-5 mt-0.5 rounded accent-pink-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-white block">
                    ⚡ Auto-Enfileirar ao Gerar Vídeos
                  </span>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                    Todos os cortes gerados entram direto na fila programada de 5 em 5 minutos.
                  </p>
                </div>
              </label>
            </div>

            {/* Interval Between Posts */}
            <div className="p-4 bg-[#0d0e15] border border-zinc-800 rounded-2xl space-y-2">
              <label className="text-xs font-bold text-zinc-300 block">
                ⏱ Intervalo Entre Cada Vídeo:
              </label>
              <select
                value={settings.intervalMinutes}
                onChange={(e) => onUpdateSettings({ intervalMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-purple-500"
              >
                <option value={1}>A cada 1 minuto (Ultra Rápido)</option>
                <option value={3}>A cada 3 minutos</option>
                <option value={5}>A cada 5 minutos (Padrão Bot Automático)</option>
                <option value={10}>A cada 10 minutos</option>
                <option value={15}>A cada 15 minutos</option>
                <option value={30}>A cada 30 minutos</option>
                <option value={60}>A cada 1 hora</option>
              </select>
              <p className="text-[10px] text-zinc-500">
                Padrão configurado: 5 minutos de diferença entre cada vídeo.
              </p>
            </div>

            {/* Target Platforms */}
            <div className="p-4 bg-[#0d0e15] border border-zinc-800 rounded-2xl space-y-2">
              <label className="text-xs font-bold text-zinc-300 block">
                🎯 Redes Sociais Alvo:
              </label>
              <div className="space-y-1.5 text-xs">
                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.targetPlatforms.youtube}
                    onChange={(e) =>
                      onUpdateSettings({
                        targetPlatforms: { ...settings.targetPlatforms, youtube: e.target.checked },
                      })
                    }
                    className="accent-red-500 rounded"
                  />
                  <Youtube className="w-3.5 h-3.5 text-red-500" />
                  <span>YouTube Shorts</span>
                  <span className={`text-[10px] ml-auto font-mono ${credentials.youtube.accessToken || credentials.youtube.refreshToken ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {credentials.youtube.accessToken || credentials.youtube.refreshToken ? '● Conectado' : '○ Sem Token'}
                  </span>
                </label>

                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.targetPlatforms.instagram}
                    onChange={(e) =>
                      onUpdateSettings({
                        targetPlatforms: { ...settings.targetPlatforms, instagram: e.target.checked },
                      })
                    }
                    className="accent-pink-500 rounded"
                  />
                  <Instagram className="w-3.5 h-3.5 text-pink-500" />
                  <span>Instagram Reels</span>
                  <span className={`text-[10px] ml-auto font-mono ${credentials.instagram.accessToken ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {credentials.instagram.accessToken ? '● Conectado' : '○ Sem Token'}
                  </span>
                </label>

                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.targetPlatforms.tiktok}
                    onChange={(e) =>
                      onUpdateSettings({
                        targetPlatforms: { ...settings.targetPlatforms, tiktok: e.target.checked },
                      })
                    }
                    className="accent-cyan-500 rounded"
                  />
                  <span className="text-cyan-400 font-black text-[10px]">TT</span>
                  <span>TikTok</span>
                  <span className={`text-[10px] ml-auto font-mono ${credentials.tiktok.accessToken ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {credentials.tiktok.accessToken ? '● Conectado' : '○ Sem Token'}
                  </span>
                </label>
              </div>

              <button
                onClick={onOpenApiModal}
                className="text-[10px] text-purple-400 hover:text-purple-300 underline font-semibold mt-1 block"
              >
                Gerenciar Tokens das APIs →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Queue Items List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-400" />
            <h3 className="text-base font-bold text-white">Vídeos na Fila de Espera ({queue.length})</h3>
          </div>

          <div className="flex items-center gap-2">
            {publishedItems.length > 0 && (
              <button
                onClick={onClearCompleted}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-semibold transition"
              >
                Limpar Concluídos ({publishedItems.length})
              </button>
            )}

            {queue.length > 0 && (
              !confirmClearAll ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/40 text-red-300 text-xs font-bold transition"
                  title="Limpar toda a fila"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar Fila ({queue.length})</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-red-950/70 border border-red-500/60 px-2.5 py-1 rounded-xl animate-fadeIn">
                  <span className="text-[11px] font-bold text-red-200">Limpar fila?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearAll();
                      setConfirmClearAll(false);
                    }}
                    className="px-2 py-0.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-extrabold transition"
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold transition"
                  >
                    Não
                  </button>
                </div>
              )
            )}
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="bg-[#141520]/60 border border-dashed border-zinc-800 rounded-3xl p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <Bot className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h4 className="text-base font-bold text-white">A fila está vazia no momento</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Clique no botão verde <strong>"🚀 INICIAR BOT AUTOMÁTICO"</strong> acima para o robô escolher um vídeo viral, gerar vários cortes e agendar todos de 5 em 5 minutos automaticamente!
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((item, index) => {
              const isExpanded = expandedItemId === item.id;
              const isPosting = isProcessingManual === item.id || item.status === 'posting';
              const countdown = item.status === 'pending' ? getCountdownInfo(item.scheduledFor) : null;

              return (
                <div
                  key={item.id}
                  className={`bg-[#141520] border rounded-2xl p-4 sm:p-5 transition-all shadow-md space-y-3 ${
                    item.status === 'posting'
                      ? 'border-purple-500 shadow-purple-900/30'
                      : item.status === 'published'
                      ? 'border-emerald-500/40 bg-emerald-950/10'
                      : item.status === 'failed'
                      ? 'border-red-500/40 bg-red-950/10'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {/* Item Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center justify-center w-8 h-8 rounded-xl bg-zinc-800 text-zinc-300 font-bold text-xs shrink-0 mt-0.5">
                        #{index + 1}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-white hover:text-pink-300 transition-colors">
                            {item.cutTitle}
                          </h4>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                            {item.startTime} - {item.endTime} ({item.durationSeconds}s)
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-950/60 border border-pink-500/30 text-pink-300">
                            {item.viralityScore} pts 🔥
                          </span>
                        </div>

                        <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
                          🎬 {item.videoTitle} • "{item.hook}"
                        </p>
                      </div>
                    </div>

                    {/* Status Badge + Live Countdown */}
                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                      {item.status === 'pending' && countdown && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black font-mono bg-amber-950/60 border border-amber-500/40 text-amber-300">
                          <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                          <span>Espera: {countdown.digital}</span>
                          <span className="text-[10px] font-sans font-normal text-amber-200/70">
                            (às {countdown.timeStr})
                          </span>
                        </span>
                      )}

                      {item.status === 'posting' && (
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-950/60 border border-purple-500/40 text-purple-300 animate-pulse">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Cortando & Publicando no Canal...</span>
                        </span>
                      )}

                      {item.status === 'published' && (
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Publicado com Sucesso</span>
                        </span>
                      )}

                      {item.status === 'failed' && (
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-950/60 border border-red-500/40 text-red-300">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                          <span>Falha no Envio</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Platforms & Details Row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/60 text-xs">
                    {/* Platforms Icons */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-zinc-400 font-semibold mr-1">Destino:</span>
                      {item.platforms.map((p) => (
                        <span
                          key={p}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-medium text-zinc-300"
                        >
                          {p === 'youtube' && <Youtube className="w-3 h-3 text-red-500" />}
                          {p === 'instagram' && <Instagram className="w-3 h-3 text-pink-500" />}
                          {p === 'tiktok' && <span className="text-cyan-400 font-bold text-[9px]">TT</span>}
                          <span className="capitalize">{p}</span>
                        </span>
                      ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold transition"
                      >
                        <Eye className="w-3 h-3" />
                        <span>{isExpanded ? 'Ocultar Detalhes' : 'Ver Legenda'}</span>
                      </button>

                      {item.status === 'published' && (
                        <a
                          href={
                            item.publishedAccounts?.find((a) => a.videoUrl)?.videoUrl ||
                            (item.publishedVideoId ? `https://youtube.com/shorts/${item.publishedVideoId}` : 'https://youtube.com/shorts/lsWTOWpzTFI')
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold transition shadow shadow-red-950"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Assistir no YouTube ↗</span>
                        </a>
                      )}

                      {item.status !== 'published' && (
                        <button
                          onClick={() => handlePostNow(item.id)}
                          disabled={isPosting}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#ff0055] via-pink-600 to-orange-500 hover:brightness-110 text-white text-[11px] font-extrabold transition disabled:opacity-50 shadow-md shadow-pink-950/50"
                        >
                          <FastForward className="w-3.5 h-3.5 fill-white" />
                          <span>
                            {isPosting ? 'Postando Agora...' : '⏭️ Pular Espera e Postar de Uma Vez'}
                          </span>
                        </button>
                      )}

                      <button
                        onClick={() => onDeleteItem(item.id)}
                        className="p-1.5 rounded-xl bg-zinc-800 hover:bg-red-950/60 text-zinc-400 hover:text-red-400 transition"
                        title="Remover da Fila"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Immediate Failure Warning and Quick Recovery Banner */}
                  {item.status === 'failed' && (
                    <div className="p-3.5 bg-gradient-to-r from-red-950/60 via-red-900/30 to-pink-950/40 border border-red-500/40 rounded-xl space-y-2.5 text-xs text-red-200 animate-fadeIn">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <span className="font-bold text-red-300 block">Falha no Envio para as Redes Oficiais</span>
                          <p className="text-[11px] text-zinc-300 leading-relaxed">
                            {item.error || 'A API oficial retornou erro de credenciais ou token expirado.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-red-500/20">
                        {onSwitchToDemoAndPost && (
                          <button
                            type="button"
                            onClick={() => onSwitchToDemoAndPost(item.id)}
                            disabled={Boolean(isPosting)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1.5 transition shadow shadow-emerald-950"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                            <span>Ativar Modo Demonstração & Publicar Agora</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handlePostNow(item.id)}
                          disabled={Boolean(isPosting)}
                          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] flex items-center gap-1.5 transition shadow"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Tentar Novamente</span>
                        </button>

                        <button
                          type="button"
                          onClick={onOpenApiModal}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-[11px] flex items-center gap-1.5 transition"
                        >
                          <Key className="w-3 h-3 text-yellow-400" />
                          <span>Configurar APIs Oficiais</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expandable Caption and Logs */}
                  {isExpanded && (
                    <div className="p-4 bg-[#0e0f17] border border-zinc-800 rounded-xl space-y-3 text-xs animate-fadeIn">
                      {item.status === 'published' && (
                        <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <div>
                              <span className="font-bold text-emerald-300 block text-xs">Publicado no Canal {item.publishedAccounts?.[0]?.account || 'ABNER_CORTES'}</span>
                              <span className="text-[11px] text-zinc-400">Vídeo ao vivo no YouTube Shorts</span>
                            </div>
                          </div>
                          <a
                            href={
                              item.publishedAccounts?.find((a) => a.videoUrl)?.videoUrl ||
                              (item.publishedVideoId ? `https://youtube.com/shorts/${item.publishedVideoId}` : 'https://youtube.com/shorts/lsWTOWpzTFI')
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition shadow"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Abrir no YouTube Shorts</span>
                          </a>
                        </div>
                      )}

                      <div>
                        <span className="font-bold text-white block mb-1">Legenda Gerada para YouTube / Shorts:</span>
                        <p className="text-zinc-300 whitespace-pre-wrap text-[11px] leading-relaxed bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                          {item.caption.youtube}
                          {'\n\n'}
                          {item.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
                        </p>
                      </div>

                      {item.error && (
                        <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-lg text-red-300 text-[11px] flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <div>
                            <strong>Motivo da falha:</strong> {item.error}
                          </div>
                        </div>
                      )}

                      {item.logs && item.logs.length > 0 && (
                        <div>
                          <span className="font-bold text-zinc-400 text-[10px] uppercase tracking-wider block mb-1">
                            Histórico de Disparos:
                          </span>
                          <div className="space-y-1 font-mono text-[10px] text-zinc-400 bg-black/60 p-2 rounded-lg border border-zinc-800">
                            {item.logs.map((log, lidx) => (
                              <div key={lidx}>{log}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
