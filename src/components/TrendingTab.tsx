import React, { useState, useEffect, useRef } from 'react';
import { Search, Flame, Sparkles, ExternalLink, Play, Clock, Check, ArrowRight, Video, RefreshCw, Bot } from 'lucide-react';
import { TrendingVideo } from '../types';
import { CURATED_TRENDING_VIDEOS } from '../mockData';
import { fetchJson } from '../utils/api';

interface TrendingTabProps {
  onSelectVideo: (url: string) => void;
  onStartAutoBot?: (customNiche?: string) => Promise<void>;
  isAutoBotRunning?: boolean;
}

const NICHES = [
  { id: 'geral', label: '🔥 Todas as Tendências' },
  { id: 'financas', label: '💰 Finanças & Negócios' },
  { id: 'neurociencia', label: '🧠 Neurociência & Produtividade' },
  { id: 'truecrime', label: '🕵️ Casos Reais & Mistério' },
  { id: 'ia_tech', label: '🤖 Inteligência Artificial & Tech' },
  { id: 'humor', label: '🎭 Humor & Entrevistas' },
];

export const TrendingTab: React.FC<TrendingTabProps> = ({
  onSelectVideo,
  onStartAutoBot,
  isAutoBotRunning,
}) => {
  const [selectedNiche, setSelectedNiche] = useState<string>('geral');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [videos, setVideos] = useState<TrendingVideo[]>(CURATED_TRENDING_VIDEOS);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const hasMountedRef = useRef<boolean>(false);

  // Auto explore on mount so live videos load once cleanly
  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;
    handleAutoExplore('geral');
  }, []);

  // Fetch trending with Gemini via /api/trending
  const handleAutoExplore = async (nicheId: string = selectedNiche) => {
    setIsLoading(true);
    try {
      const res = await fetchJson<any>('/api/trending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: nicheId }),
      });
      const data = res.data;
      if (res.ok && data?.trending && Array.isArray(data.trending) && data.trending.length > 0) {
        setVideos(data.trending);
      }
    } catch (err) {
      console.error('Error fetching trending:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetchJson<any>('/api/trending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: searchQuery.trim() }),
      });
      const data = res.data;
      if (res.ok && data?.trending && data.trending.length > 0) {
        setVideos(data.trending);
      }
    } catch (err) {
      console.error('Error searching:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Banner Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#141226] via-[#1a142e] to-[#24132e] border border-purple-900/40 p-6 sm:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-gradient-to-br from-[#ff0055]/20 to-[#7000ff]/20 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-fuchsia-500/10 border border-fuchsia-500/30 text-pink-300 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            Caçador de Vídeos Virais por Inteligência Artificial
          </div>
          
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight mb-3">
            Descubra as maiores fontes de{' '}
            <span className="bg-gradient-to-r from-[#ff0055] via-fuchsia-400 to-[#7000ff] bg-clip-text text-transparent">
              cortes virais
            </span>{' '}
            da internet.
          </h2>

          <p className="text-zinc-300 text-sm sm:text-base leading-relaxed mb-6">
            A IA do Gemini analisa podcasts, entrevistas longas e debates em alta que concentram os ganchos mentais mais magnéticos para prender espectadores e explodir seu alcance no YouTube Shorts, TikTok e Instagram Reels.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {onStartAutoBot && (
              <button
                onClick={() => onStartAutoBot(selectedNiche)}
                disabled={isAutoBotRunning}
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-zinc-950 font-black text-sm shadow-xl shadow-emerald-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <Bot className={`w-5 h-5 ${isAutoBotRunning ? 'animate-spin' : ''}`} />
                <span>
                  {isAutoBotRunning
                    ? '🤖 Bot Automático Executando...'
                    : '🤖 BOT AUTOMÁTICO (Escolher + Cortar + Postar 5 em 5 min)'}
                </span>
              </button>
            )}

            <button
              onClick={() => handleAutoExplore(selectedNiche)}
              disabled={isLoading}
              className="flex items-center gap-2.5 px-5 py-3.5 rounded-xl bg-gradient-to-r from-[#7000ff] via-[#b000ff] to-[#ff0055] text-white font-bold text-sm shadow-lg shadow-purple-600/30 hover:shadow-pink-600/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <Flame className={`w-5 h-5 text-yellow-300 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Buscando Vídeos em Alta...' : '🔥 Auto-Explorar Tendências'}</span>
            </button>

            <button
              onClick={() => handleAutoExplore(selectedNiche)}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-3.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-750 border border-zinc-700/80 text-zinc-300 hover:text-white font-semibold text-xs transition"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-pink-400' : ''}`} />
              <span>Recarregar Episódios</span>
            </button>

            <span className="text-xs text-zinc-400 font-medium ml-1">
              {videos.length} vídeos catalogados
            </span>
          </div>
        </div>
      </div>

      {/* Filter Niches Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {NICHES.map((niche) => (
          <button
            key={niche.id}
            onClick={() => {
              setSelectedNiche(niche.id);
              handleAutoExplore(niche.id);
            }}
            className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              selectedNiche === niche.id
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-pink-900/30 border border-pink-400/30'
                : 'bg-[#161722] text-zinc-400 hover:text-zinc-200 hover:bg-[#1f2030] border border-zinc-800'
            }`}
          >
            {niche.label}
          </button>
        ))}
      </div>

      {/* Manual Search Bar & Results Counter */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <form onSubmit={handleManualSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar por nicho ou podcast (Ex: inteligência artificial, estoicismo, comédia, finanças...)"
              className="w-full pl-11 pr-4 py-3 bg-[#151622] border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-semibold text-sm transition flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            <span>Buscar</span>
          </button>
        </form>

        <div className="flex items-center gap-2 px-3 py-2 bg-[#151622] border border-zinc-800/80 rounded-xl text-xs font-semibold text-zinc-400 self-end sm:self-auto shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Exibindo <strong className="text-white">{videos.length}</strong> podcasts em alta</span>
        </div>
      </div>

      {/* Video Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {videos.map((vid, idx) => {
          const isCopied = copiedUrl === vid.url;
          const isPreviewing = previewVideoId === vid.videoId;

          return (
            <div
              key={`${vid.videoId}-${idx}`}
              className="group flex flex-col bg-[#14151f] border border-zinc-800/90 hover:border-purple-500/50 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-purple-950/20"
            >
              {/* Thumbnail / Player Preview */}
              <div className="relative aspect-video bg-black overflow-hidden">
                {isPreviewing ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${vid.videoId}?autoplay=1&modestbranding=1`}
                    title={vid.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <>
                    <img
                      src={`https://img.youtube.com/vi/${vid.videoId}/hqdefault.jpg`}
                      alt={vid.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.dataset.triedFallback) {
                          target.dataset.triedFallback = 'true';
                          target.src = `https://img.youtube.com/vi/${vid.videoId}/0.jpg`;
                        } else {
                          target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22480%22%20height%3D%22360%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23181824%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%23a1a1aa%22%20font-size%3D%2216%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3E%E2%96%B6%20V%C3%ADdeo%20em%20Alta%3C%2Ftext%3E%3C%2Fsvg%3E';
                        }
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

                    {/* Quick Play Preview Overlay Button */}
                    <button
                      onClick={() => setPreviewVideoId(vid.videoId)}
                      className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-xs"
                      title="Assistir prévia rápida"
                    >
                      <div className="w-12 h-12 rounded-full bg-pink-600/90 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5 fill-white ml-0.5" />
                      </div>
                    </button>

                    {/* Virality Score Badge */}
                    <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-pink-500/40 flex items-center gap-1.5 shadow-md">
                      <Flame className="w-3.5 h-3.5 text-pink-400 fill-pink-400" />
                      <span className="text-xs font-extrabold text-pink-300">
                        {vid.viralityScore}% Viral
                      </span>
                    </div>

                    {/* Duration Badge */}
                    {vid.duration && (
                      <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded text-[11px] font-semibold bg-black/80 backdrop-blur-md text-zinc-300 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        <span>{vid.duration}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Card Content */}
              <div className="flex-1 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                      {vid.channel}
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-white line-clamp-2 mb-2 leading-snug group-hover:text-purple-300 transition-colors">
                    {vid.title}
                  </h3>

                  <p className="text-xs text-zinc-400 line-clamp-2 mb-3 leading-relaxed">
                    {vid.reason}
                  </p>

                  {/* Themes Pills */}
                  {vid.suggestedThemes && vid.suggestedThemes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {vid.suggestedThemes.map((theme, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-800/80 text-zinc-300 border border-zinc-700/50"
                        >
                          #{theme}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-zinc-800/80 flex items-center gap-2">
                  <button
                    onClick={() => onSelectVideo(vid.url)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#7000ff] to-[#ff0055] hover:opacity-95 text-white text-xs font-bold shadow-md shadow-purple-950/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span>⚡ Fazer Cortes</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleCopyLink(vid.url)}
                    className={`p-2.5 rounded-xl border text-xs font-semibold transition ${
                      isCopied
                        ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                        : 'bg-zinc-800/70 border-zinc-700/60 text-zinc-300 hover:text-white hover:bg-zinc-700'
                    }`}
                    title={isCopied ? 'Link Copiado!' : 'Copiar URL do Vídeo'}
                  >
                    {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <ExternalLink className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
