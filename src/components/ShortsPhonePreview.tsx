import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Heart,
  MessageCircle,
  Share2,
  Disc3,
  Sparkles,
  Mic,
  Users,
  Layout,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Bookmark,
  Send,
  MoreVertical,
  MoreHorizontal,
  Search,
  Plus,
  Music2,
  Camera,
  Film,
  Image as ImageIcon,
  Check,
  Type,
} from 'lucide-react';
import { VideoFormat, SubtitleTheme, SocialPlatform } from '../types';

interface ShortsPhonePreviewProps {
  videoId?: string;
  videoUrl?: string;
  videoSrc?: string;
  thumbnailUrl?: string;
  startSeconds: number;
  endSeconds: number;
  format: VideoFormat;
  subtitleTheme?: SubtitleTheme;
  showSubtitles?: boolean;
  activeSpeaker?: string;
  overlayTitle?: string;
  partBadge?: string;
  hook?: string;
  subtitles?: string[];
  teaserOffsetSec?: number;
  teaserDurationSec?: number;
  teaserText?: string;
  retentionStrategyOption?: 1 | 2 | 3;
  initialPlatform?: SocialPlatform;
  onPlatformChange?: (platform: SocialPlatform) => void;
  channelName?: string;
  speaker1X?: number;
  speaker1Y?: number;
  speaker2X?: number;
  speaker2Y?: number;
  zoom?: number;
}

// Fallback to verified 100% active YouTube video if videoId is dead/empty
const RELIABLE_FALLBACK_VIDEO_ID = 'B57eOqeLVfc';

/**
 * Strips emojis and splits any long string into clean 2-3 word chunks (max 16 chars)
 * so the screen is NEVER polluted with giant paragraphs.
 */
function normalizeCleanSubtitleChunks(rawList?: string[], fallbackHook?: string): string[] {
  const source = rawList && rawList.length > 0 ? rawList : [fallbackHook || 'PRESTE ATENÇÃO'];
  const allWords = source
    .join(' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/["'«»“”„]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const chunks: string[] = [];
  let i = 0;
  while (i < allWords.length && chunks.length < 18) {
    const w1 = allWords[i].toUpperCase();
    const w2 = allWords[i + 1]?.toUpperCase() || '';
    const w3 = allWords[i + 2]?.toUpperCase() || '';
    if (w2 && w3 && (w1 + ' ' + w2 + ' ' + w3).length <= 15) {
      chunks.push(`${w1} ${w2} ${w3}`);
      i += 3;
    } else if (w2 && (w1 + ' ' + w2).length <= 16) {
      chunks.push(`${w1} ${w2}`);
      i += 2;
    } else {
      chunks.push(w1.slice(0, 16));
      i += 1;
    }
  }
  return chunks.length > 0 ? chunks : ['OLHA ISSO', 'PRESTE ATENÇÃO'];
}

export const ShortsPhonePreview: React.FC<ShortsPhonePreviewProps> = ({
  videoId,
  videoUrl,
  videoSrc,
  thumbnailUrl,
  startSeconds,
  endSeconds,
  format,
  subtitleTheme = 'clean',
  showSubtitles = false,
  activeSpeaker,
  overlayTitle = '',
  partBadge,
  hook,
  subtitles = ['ARMA PODEROSA', 'SEJA COMPETITIVO', 'NUNCA ACOMODE'],
  teaserOffsetSec = 24,
  teaserDurationSec = 4,
  teaserText = 'SER COMPETITIVO É UMA ARMA',
  retentionStrategyOption = 3,
  initialPlatform = 'youtube',
  onPlatformChange,
  channelName = 'cortes_virais',
  speaker1X = 38,
  speaker1Y = 30,
  speaker2X = 62,
  speaker2Y = 30,
  zoom = 1.0,
}) => {
  const [platform, setPlatform] = useState<SocialPlatform>(initialPlatform);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isSubtitleVisible, setIsSubtitleVisible] = useState<boolean>(showSubtitles);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(0);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [previewMode, setPreviewMode] = useState<'embed' | 'poster'>('embed');
  const [showSafeZones, setShowSafeZones] = useState<boolean>(false);
  const [activeDynamicCam, setActiveDynamicCam] = useState<1 | 2>(2);
  const [isPlayingColdOpen, setIsPlayingColdOpen] = useState<boolean>(false);
  const [quickCropOverride, setQuickCropOverride] = useState<{
    s1x?: number;
    s2x?: number;
    sY?: number;
    z?: number;
    fmt?: VideoFormat;
  } | null>(null);
  const duration = Math.max(1, endSeconds - startSeconds);

  // Resolved framing considering 1-click quick crop overrides
  const effectiveFormat = quickCropOverride?.fmt || format;
  const effectiveS1X = quickCropOverride?.s1x ?? speaker1X;
  const effectiveS2X = quickCropOverride?.s2x ?? speaker2X;
  const effectiveSY = quickCropOverride?.sY ?? speaker1Y;
  const effectiveZoom = quickCropOverride?.z ?? zoom;

  const cleanSubtitles = React.useMemo(
    () => normalizeCleanSubtitleChunks(subtitles, hook),
    [subtitles, hook]
  );

  const cleanTeaserChunks = React.useMemo(
    () => normalizeCleanSubtitleChunks([teaserText], hook),
    [teaserText, hook]
  );

  // Extract discreet Part Badge ("PARTE 1") if present in partBadge or overlayTitle
  const resolvedPartBadge = React.useMemo(() => {
    if (partBadge) return partBadge.toUpperCase();
    const match = overlayTitle?.match(/PARTE\s*\d+(?:\s*-\s*FINAL)?/i);
    return match ? match[0].toUpperCase() : '';
  }, [partBadge, overlayTitle]);

  // Sync initial platform if parent prop changes
  useEffect(() => {
    if (initialPlatform) {
      setPlatform(initialPlatform);
    }
  }, [initialPlatform]);

  // Automatic camera switcher for Klap / Opus Clip 'dynamic_reframe' mode
  useEffect(() => {
    if (format !== 'dynamic_reframe') return;
    const camInterval = setInterval(() => {
      setActiveDynamicCam((prev) => (prev === 1 ? 2 : 1));
    }, 4500);
    return () => clearInterval(camInterval);
  }, [format]);

  // Cold-Open Climax Teaser timer (auto-switches back to full cut after 4 seconds when triggered)
  useEffect(() => {
    if (!isPlayingColdOpen) return;
    const timer = setTimeout(() => {
      setIsPlayingColdOpen(false);
    }, (teaserDurationSec || 4) * 1000);
    return () => clearTimeout(timer);
  }, [isPlayingColdOpen, teaserDurationSec]);

  const handleSetPlatform = (p: SocialPlatform) => {
    setPlatform(p);
    onPlatformChange?.(p);
  };

  // Resolve valid video ID
  let safeVideoId = videoId;
  if (!safeVideoId || safeVideoId === 'y7G5J2_7c5w' || safeVideoId === 'b5m4yBkJw58') {
    const match = videoUrl?.match(/(?:v=|\/v\/|embed\/|youtu\.be\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
    safeVideoId = match?.[1] || RELIABLE_FALLBACK_VIDEO_ID;
  }

  // High definition thumbnail fallback
  const fallbackThumb =
    thumbnailUrl ||
    `https://img.youtube.com/vi/${safeVideoId}/maxresdefault.jpg`;

  // Fast 2-word karaoke subtitle animator (950ms per 2-word chunk — Submagic / CapCut cadence)
  useEffect(() => {
    const activeList = isPlayingColdOpen ? cleanTeaserChunks : cleanSubtitles;
    if (!activeList || activeList.length === 0) return;
    const interval = setInterval(() => {
      setActiveWordIndex((prev) => (prev + 1) % activeList.length);
    }, 950);
    return () => clearInterval(interval);
  }, [cleanSubtitles, cleanTeaserChunks, isPlayingColdOpen]);

  // Calculate playback window (Cold-Open Climax Teaser vs Main Cut)
  const effectiveStartSeconds = isPlayingColdOpen
    ? Math.min(endSeconds - 4, startSeconds + Math.max(8, teaserOffsetSec))
    : startSeconds;
  const effectiveEndSeconds = isPlayingColdOpen
    ? Math.min(endSeconds, effectiveStartSeconds + (teaserDurationSec || 4))
    : endSeconds;

  // Primary YouTube No-Cookie embed URL (plays audio when unmuted)
  const primaryEmbedUrl = `https://www.youtube-nocookie.com/embed/${safeVideoId}?autoplay=1&mute=${
    isMuted ? '1' : '0'
  }&start=${effectiveStartSeconds}&end=${effectiveEndSeconds}&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`;

  // Secondary YouTube embed URL: ALWAYS MUTED (mute=1) to eliminate 100% of audio echo in split_screen and vertical_blur!
  const mutedEmbedUrl = `https://www.youtube-nocookie.com/embed/${safeVideoId}?autoplay=1&mute=1&start=${effectiveStartSeconds}&end=${effectiveEndSeconds}&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`;

  /**
   * Computes exact 1:1 distortion-free CSS positioning for a 16:9 YouTube iframe inside a 9:16 or 9:8 crop container.
   * Guarantees 100% natural headroom (hair/forehead never cut off), rule-of-thirds eye level, and clamps X to valid video bounds.
   */
  const getSmartCropIframeStyle = (
    focusX: number = 50,
    focusY: number = 30,
    zoomLevel: number = 1.0
  ): React.CSSProperties => {
    // Clamping focusX between 18% and 82% prevents showing empty black borders
    const clampedX = Math.max(18, Math.min(82, focusX));
    // Safe zoom: default 1.0 (100% height), capped at 1.15 to avoid massive heads cutting off foreheads and chins
    const safeZoom = Math.max(1.0, Math.min(1.15, zoomLevel));
    // Height is exactly 101% to fill container without subpixel gaps
    const heightPercent = Math.round(101 * safeZoom);

    // At zoom 1.0, translate(-clampedX%, -50%) centers vertically with 0px cut off at top and bottom.
    // If zoomed in slightly (e.g. 1.05), anchor slightly towards top to protect headroom (hair).
    const translateY = safeZoom <= 1.02 ? 50 : 48;

    return {
      position: 'absolute',
      top: '50%',
      left: '50%',
      height: `${heightPercent}%`,
      width: 'auto',
      aspectRatio: '16 / 9',
      maxWidth: 'none',
      transform: `translate(-${clampedX}%, -${translateY}%)`,
      pointerEvents: 'none',
    };
  };

  // Dynamic social counters per platform
  const stats = {
    youtube: { likes: '184 mil', comments: '2.418', shares: 'Compartilhar' },
    tiktok: { likes: '428.5K', comments: '3,892', bookmarks: '78.4K', shares: '15.2K' },
    instagram: { likes: '92,4 mil', comments: '1.294', shares: '19,3 mil' },
  };

  // Split current 2-word chunk so we can highlight the last word in vibrant color (Submagic karaoke effect)
  const activeChunkList = isPlayingColdOpen ? cleanTeaserChunks : cleanSubtitles;
  const currentChunkText = activeChunkList[activeWordIndex % activeChunkList.length] || 'OLHA ISSO';
  const chunkWords = currentChunkText.split(' ');
  const firstWords = chunkWords.length > 1 ? chunkWords.slice(0, -1).join(' ') + ' ' : '';
  const highlightedWord = chunkWords[chunkWords.length - 1] || currentChunkText;

  return (
    <div className="relative flex flex-col items-center select-none animate-fadeIn">
      {/* 1. Multi-Platform UI Selector Bar */}
      <div className="mb-3.5 flex items-center gap-1.5 p-1 bg-zinc-950/90 border border-zinc-800 rounded-2xl shadow-xl backdrop-blur-md">
        <button
          onClick={() => handleSetPlatform('youtube')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            platform === 'youtube'
              ? 'bg-red-600 text-white shadow-md shadow-red-950/50 scale-[1.02]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
          title="Ver prévia com a interface oficial do YouTube Shorts"
        >
          <span className="w-2 h-2 rounded-full bg-white shadow-sm" />
          <span>YouTube Shorts</span>
        </button>

        <button
          onClick={() => handleSetPlatform('tiktok')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            platform === 'tiktok'
              ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]/50 shadow-md shadow-cyan-950/40 scale-[1.02]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
          title="Ver prévia com a interface oficial do TikTok (Para Você)"
        >
          <span>🎵 TikTok</span>
        </button>

        <button
          onClick={() => handleSetPlatform('instagram')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            platform === 'instagram'
              ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white shadow-md shadow-pink-950/50 scale-[1.02]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
          title="Ver prévia com a interface oficial do Instagram Reels"
        >
          <span>📸 Reels</span>
        </button>
      </div>

      {/* 2. Smartphone Outer Chassis */}
      <div className="relative w-[300px] sm:w-[324px] h-[610px] sm:h-[650px] bg-[#090a0f] rounded-[46px] p-3 shadow-[0_25px_70px_-15px_rgba(112,0,255,0.45)] border-[6px] border-zinc-800 ring-1 ring-white/10 overflow-hidden">
        
        {/* Dynamic Island / iPhone Notch */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-40 flex items-center justify-between px-3 shadow-inner">
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-900 border border-zinc-700/60" />
          <div className="w-2 h-2 rounded-full bg-blue-900/40" />
        </div>

        {/* Screen Area (9:16 Aspect) */}
        <div className="relative w-full h-full rounded-[36px] overflow-hidden bg-black flex flex-col items-center justify-center">
          
          {/* OPTIONAL SAFE ZONE GUIDES OVERLAY (Hidden by default to keep screen 100% clean) */}
          {showSafeZones && (
            <div className="absolute inset-0 z-40 pointer-events-none">
              <div className="absolute top-14 bottom-24 left-3 right-14 border-2 border-dashed border-emerald-400/70 rounded-xl flex flex-col justify-between p-2">
                <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-300 text-[8px] font-mono font-bold uppercase w-fit">
                  Zona Segura • Câm 2: {speaker2X}% | Câm 1: {speaker1X}%
                </span>
                {activeSpeaker && (
                  <span className="px-1.5 py-0.5 rounded bg-black/80 text-zinc-300 text-[8px] font-mono w-fit">
                    Voz: {activeSpeaker}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* TOP STATUS / PLATFORM HEADER OVERLAY */}
          {platform === 'youtube' && (
            <div className="absolute top-11 left-3 right-3 z-30 flex items-center justify-between text-white pointer-events-none drop-shadow">
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-red-600 flex items-center justify-center text-[10px] font-black">
                  ▶
                </span>
                <span className="font-extrabold text-xs tracking-tight">Shorts</span>
                {resolvedPartBadge && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-sm border border-white/15 text-[9px] font-black text-amber-300 tracking-wider">
                    {resolvedPartBadge}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Search className="w-4 h-4 text-white" />
                <MoreVertical className="w-4 h-4 text-white" />
              </div>
            </div>
          )}

          {platform === 'tiktok' && (
            <div className="absolute top-11 left-4 right-4 z-30 flex items-center justify-between text-white pointer-events-none drop-shadow">
              {resolvedPartBadge ? (
                <span className="px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-sm border border-white/15 text-[8px] font-black text-amber-300">
                  {resolvedPartBadge}
                </span>
              ) : (
                <div className="w-4" />
              )}
              <div className="flex items-center gap-3.5 text-xs font-bold">
                <span className="text-zinc-400">Seguindo</span>
                <div className="relative">
                  <span className="text-white font-extrabold">Para Você</span>
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-white rounded-full" />
                </div>
              </div>
              <Search className="w-4 h-4 text-white" />
            </div>
          )}

          {platform === 'instagram' && (
            <div className="absolute top-11 left-4 right-4 z-30 flex items-center justify-between text-white pointer-events-none drop-shadow">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-tight">Reels</span>
                {resolvedPartBadge && (
                  <span className="px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-sm border border-white/15 text-[9px] font-black text-amber-300">
                    {resolvedPartBadge}
                  </span>
                )}
              </div>
              <Camera className="w-4 h-4 text-white" />
            </div>
          )}

          {/* DISCREET COLD-OPEN CLIMAX INDICATOR PILL (Only visible while previewing the 4s climax hook) */}
          {isPlayingColdOpen && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/95 text-black text-[9px] font-black uppercase tracking-wider shadow-lg flex items-center gap-1 animate-pulse">
                <span>⚡ GANCHO CLÍMAX (00:00–00:04)</span>
              </span>
            </div>
          )}

          {/* VIDEO LAYER: REAL VIDEO / EMBED / POSTER SIMULATOR */}
          {videoSrc ? (
            /* Direct rendered MP4 playback */
            <div className="relative z-10 w-full h-full overflow-hidden bg-black flex items-center justify-center">
              <video
                src={videoSrc}
                autoPlay
                loop
                muted={isMuted}
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
          ) : previewMode === 'embed' ? (
            /* YouTube Embed with Distortion-Free 16:9 Smart Crop & Single Audio Stream */
            <>
              {effectiveFormat === 'vertical_blur' && (
                <div className="absolute inset-0 z-0 overflow-hidden">
                  <iframe
                    src={mutedEmbedUrl}
                    title="Background Blur (Muted)"
                    referrerPolicy="strict-origin-when-cross-origin"
                    style={getSmartCropIframeStyle(50, 30, 1.15)}
                    className="filter blur-xl opacity-55"
                    allow="autoplay; encrypted-media"
                  />
                </div>
              )}

              {effectiveFormat === 'split_screen' ? (
                /* Dual Camera Vertical Stack (Exact 9:8 per half, Zero Visual Pollution, Clean 2px Seam, 100% Headroom) */
                <div className="relative z-10 w-full h-full flex flex-col">
                  {/* Top: Convidado (Speaker 2) - Primary Audio Source */}
                  <div className="relative w-full h-1/2 overflow-hidden bg-black">
                    <iframe
                      src={primaryEmbedUrl}
                      title="Guest Camera (Top - Primary Audio)"
                      referrerPolicy="strict-origin-when-cross-origin"
                      style={getSmartCropIframeStyle(effectiveS2X, effectiveSY, effectiveZoom)}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    />
                  </div>

                  {/* Clean Subtle 2px Dark Seam (Zero visual pollution) */}
                  <div className="relative w-full h-[2px] bg-black/90 z-20" />

                  {/* Bottom: Host (Speaker 1) - ALWAYS MUTED to prevent Audio Echo */}
                  <div className="relative w-full h-1/2 overflow-hidden bg-black">
                    <iframe
                      src={mutedEmbedUrl}
                      title="Host Camera (Bottom - Muted)"
                      referrerPolicy="strict-origin-when-cross-origin"
                      style={getSmartCropIframeStyle(effectiveS1X, effectiveSY, effectiveZoom)}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    />
                  </div>
                </div>
              ) : effectiveFormat === 'dynamic_reframe' ? (
                /* Klap / Opus Clip Auto-Reframe: Smoothly switches between Speaker 2 and Speaker 1 */
                <div className="relative z-10 w-full h-full overflow-hidden bg-black">
                  <iframe
                    src={primaryEmbedUrl}
                    title="Dynamic Auto-Reframe Preview"
                    referrerPolicy="strict-origin-when-cross-origin"
                    style={{
                      ...getSmartCropIframeStyle(
                        activeDynamicCam === 2 ? effectiveS2X : effectiveS1X,
                        effectiveSY,
                        effectiveZoom
                      ),
                      transition: 'transform 650ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  />
                </div>
              ) : effectiveFormat === 'speaker_left' ? (
                <div className="relative z-10 w-full h-full overflow-hidden bg-black">
                  <iframe
                    src={primaryEmbedUrl}
                    title="Left Speaker Preview"
                    referrerPolicy="strict-origin-when-cross-origin"
                    style={getSmartCropIframeStyle(effectiveS1X, effectiveSY, effectiveZoom)}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  />
                </div>
              ) : effectiveFormat === 'speaker_right' ? (
                <div className="relative z-10 w-full h-full overflow-hidden bg-black">
                  <iframe
                    src={primaryEmbedUrl}
                    title="Right Speaker Preview"
                    referrerPolicy="strict-origin-when-cross-origin"
                    style={getSmartCropIframeStyle(effectiveS2X, effectiveSY, effectiveZoom)}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  />
                </div>
              ) : effectiveFormat === 'vertical_crop' || effectiveFormat === 'speaker_center' ? (
                <div className="relative z-10 w-full h-full overflow-hidden bg-black">
                  <iframe
                    src={primaryEmbedUrl}
                    title="Center Speaker 9:16 Preview"
                    referrerPolicy="strict-origin-when-cross-origin"
                    style={getSmartCropIframeStyle(50, effectiveSY, effectiveZoom)}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  />
                </div>
              ) : (
                <div
                  className={`relative z-10 w-full transition-all duration-300 overflow-hidden ${
                    format === 'vertical_blur'
                      ? 'aspect-video w-full shadow-2xl border-y border-white/10'
                      : format === 'square'
                      ? 'aspect-square w-full shadow-2xl'
                      : 'aspect-video w-full shadow-2xl'
                  }`}
                >
                  <iframe
                    src={primaryEmbedUrl}
                    title="YouTube Shorts Preview"
                    referrerPolicy="strict-origin-when-cross-origin"
                    style={
                      format === 'square'
                        ? getSmartCropIframeStyle(50, 50, 1.05)
                        : { width: '100%', height: '100%' }
                    }
                    className="w-full h-full object-cover pointer-events-auto"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              )}
            </>
          ) : (
            /* Realistic High-Res Simulation Poster Mode */
            <div className="relative z-10 w-full h-full overflow-hidden bg-zinc-950 flex items-center justify-center">
              <img
                src={fallbackThumb}
                alt="Prévia em Alta Definição"
                className="w-full h-full object-cover opacity-90 scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/60 pointer-events-none" />
            </div>
          )}

          {/* OVERLAY: CLEAN DISCREET SUBTITLES (Zero Visual Pollution, Hidden by Default, Calm & Non-Intrusive) */}
          {isSubtitleVisible && subtitleTheme !== 'none' && activeChunkList.length > 0 && (
            <div
              className={`absolute left-4 right-14 z-30 pointer-events-none text-center flex items-center justify-center ${
                effectiveFormat === 'split_screen'
                  ? 'top-1/2 -translate-y-1/2'
                  : 'bottom-20'
              }`}
            >
              <div className="px-3 py-1 rounded-xl bg-black/65 backdrop-blur-md max-w-[210px] mx-auto border border-white/10 shadow-lg transition-opacity duration-200">
                <p className="font-bold text-xs sm:text-sm tracking-normal uppercase leading-tight text-white select-none">
                  <span>{firstWords}</span>
                  <span
                    className={
                      isPlayingColdOpen
                        ? 'text-amber-300'
                        : subtitleTheme === 'beast'
                        ? 'text-emerald-400'
                        : subtitleTheme === 'cyberpunk'
                        ? 'text-cyan-300'
                        : subtitleTheme === 'hormozi'
                        ? 'text-yellow-300'
                        : 'text-white font-extrabold'
                    }
                  >
                    {highlightedWord}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* 3. PLATFORM-SPECIFIC OVERLAY HUD (YouTube / TikTok / Reels) */}
          {platform === 'youtube' && (
            <>
              {/* Right Sidebar - YouTube Shorts Native Controls */}
              <div className="absolute right-2.5 bottom-16 z-30 flex flex-col items-center gap-3.5 text-white">
                <button
                  onClick={() => setIsLiked(!isLiked)}
                  className="flex flex-col items-center gap-0.5 group active:scale-90 transition-transform"
                >
                  <div className={`p-2 rounded-full ${isLiked ? 'bg-red-600 text-white' : 'bg-black/50 text-white'}`}>
                    <ThumbsUp className={`w-4 h-4 ${isLiked ? 'fill-white' : ''}`} />
                  </div>
                  <span className="text-[10px] font-bold drop-shadow">{stats.youtube.likes}</span>
                </button>

                <div className="flex flex-col items-center gap-0.5">
                  <div className="p-2 rounded-full bg-black/50">
                    <ThumbsDown className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-[9px] font-medium drop-shadow">Dislike</span>
                </div>

                <div className="flex flex-col items-center gap-0.5">
                  <div className="p-2 rounded-full bg-black/50">
                    <MessageSquare className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-[10px] font-bold drop-shadow">{stats.youtube.comments}</span>
                </div>

                <div className="flex flex-col items-center gap-0.5">
                  <div className="p-2 rounded-full bg-black/50">
                    <Share2 className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-[9px] font-bold drop-shadow">Partilhar</span>
                </div>

                <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 p-0.5 flex items-center justify-center shadow">
                  <Disc3 className="w-4 h-4 text-white animate-spin duration-3000" />
                </div>
              </div>

              {/* Bottom Info - YouTube Shorts Native Channel Bar */}
              <div className="absolute left-3 right-16 bottom-5 z-30 text-white pointer-events-none">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center font-bold text-xs text-white shadow">
                    {channelName[0]?.toUpperCase() || 'C'}
                  </div>
                  <span className="text-xs font-bold truncate">@{channelName}</span>
                  <button
                    onClick={() => setIsSubscribed(!isSubscribed)}
                    className={`pointer-events-auto px-2.5 py-0.5 rounded-full text-[10px] font-extrabold transition shadow ${
                      isSubscribed
                        ? 'bg-zinc-800 text-zinc-300'
                        : 'bg-white hover:bg-zinc-200 text-black'
                    }`}
                  >
                    {isSubscribed ? 'Inscrito' : 'Inscrever-se'}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-100 line-clamp-2 leading-tight drop-shadow font-medium">
                  {hook || 'Esse trecho vai explodir sua mente! Salve para rever depois. #Shorts'}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-300">
                  <Music2 className="w-3 h-3 text-red-400" />
                  <span className="truncate">Som original - @{channelName}</span>
                </div>
              </div>

              {/* YouTube Red Progress Bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800/80 z-30">
                <div className="h-full bg-red-600 animate-pulse w-3/4" />
              </div>
            </>
          )}

          {platform === 'tiktok' && (
            <>
              {/* Right Sidebar - TikTok Native Controls */}
              <div className="absolute right-2.5 bottom-14 z-30 flex flex-col items-center gap-3.5 text-white">
                {/* TikTok Avatar with Red Plus Badge */}
                <div className="relative mb-1">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-400 via-pink-500 to-yellow-400 p-[1.5px]">
                    <div className="w-full h-full bg-zinc-900 rounded-full flex items-center justify-center font-black text-xs">
                      {channelName[0]?.toUpperCase() || 'T'}
                    </div>
                  </div>
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#ff0055] text-white flex items-center justify-center text-[11px] font-bold shadow">
                    +
                  </div>
                </div>

                <button
                  onClick={() => setIsLiked(!isLiked)}
                  className="flex flex-col items-center gap-0.5 group active:scale-90 transition-transform"
                >
                  <div className="p-2 rounded-full bg-black/40 backdrop-blur-sm">
                    <Heart className={`w-5 h-5 ${isLiked ? 'fill-[#ff0055] text-[#ff0055]' : 'text-white'}`} />
                  </div>
                  <span className="text-[10px] font-extrabold drop-shadow">{stats.tiktok.likes}</span>
                </button>

                <div className="flex flex-col items-center gap-0.5">
                  <div className="p-2 rounded-full bg-black/40 backdrop-blur-sm">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[10px] font-extrabold drop-shadow">{stats.tiktok.comments}</span>
                </div>

                <button
                  onClick={() => setIsBookmarked(!isBookmarked)}
                  className="flex flex-col items-center gap-0.5 group active:scale-90 transition-transform"
                >
                  <div className="p-2 rounded-full bg-black/40 backdrop-blur-sm">
                    <Bookmark className={`w-5 h-5 ${isBookmarked ? 'fill-yellow-400 text-yellow-400' : 'text-white'}`} />
                  </div>
                  <span className="text-[10px] font-extrabold drop-shadow">{stats.tiktok.bookmarks}</span>
                </button>

                <div className="flex flex-col items-center gap-0.5">
                  <div className="p-2 rounded-full bg-black/40 backdrop-blur-sm">
                    <Share2 className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[10px] font-extrabold drop-shadow">{stats.tiktok.shares}</span>
                </div>

                <div className="w-7 h-7 rounded-full bg-zinc-900 border-2 border-zinc-700 flex items-center justify-center animate-spin duration-3000 shadow-lg">
                  <Disc3 className="w-4 h-4 text-white" />
                </div>
              </div>

              {/* Bottom Info - TikTok Native Handle & Sound Marquee */}
              <div className="absolute left-3 right-16 bottom-4 z-30 text-white pointer-events-none">
                <span className="text-xs font-black block mb-1 drop-shadow">@{channelName}</span>
                <p className="text-[11px] text-zinc-100 line-clamp-2 leading-tight drop-shadow font-normal">
                  {hook || 'Esse momento vai explodir sua mente! 🤯 #fyp #viral #foryou #cortes #reflexao'}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-200">
                  <Music2 className="w-3 h-3 text-cyan-400 animate-pulse" />
                  <span className="truncate">♫ som original - @{channelName}</span>
                </div>
              </div>

              {/* TikTok Thin White Progress Line */}
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/20 z-30">
                <div className="h-full bg-white w-2/3" />
              </div>
            </>
          )}

          {platform === 'instagram' && (
            <>
              {/* Right Sidebar - Instagram Reels Native Controls */}
              <div className="absolute right-2.5 bottom-14 z-30 flex flex-col items-center gap-3.5 text-white">
                <button
                  onClick={() => setIsLiked(!isLiked)}
                  className="flex flex-col items-center gap-0.5 group active:scale-90 transition-transform"
                >
                  <div className="p-2 rounded-full bg-black/30 backdrop-blur-sm">
                    <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
                  </div>
                  <span className="text-[10px] font-bold drop-shadow">{stats.instagram.likes}</span>
                </button>

                <div className="flex flex-col items-center gap-0.5">
                  <div className="p-2 rounded-full bg-black/30 backdrop-blur-sm">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[10px] font-bold drop-shadow">{stats.instagram.comments}</span>
                </div>

                <div className="flex flex-col items-center gap-0.5">
                  <div className="p-2 rounded-full bg-black/30 backdrop-blur-sm">
                    <Send className="w-5 h-5 text-white -rotate-12" />
                  </div>
                  <span className="text-[10px] font-bold drop-shadow">{stats.instagram.shares}</span>
                </div>

                <div className="p-2 rounded-full bg-black/30 backdrop-blur-sm">
                  <MoreHorizontal className="w-5 h-5 text-white" />
                </div>

                <div className="w-6 h-6 rounded border border-white/60 bg-zinc-800 p-0.5 flex items-center justify-center shadow">
                  <Disc3 className="w-4 h-4 text-white" />
                </div>
              </div>

              {/* Bottom Info - Instagram Reels Profile & Audio Tag */}
              <div className="absolute left-3 right-16 bottom-4 z-30 text-white pointer-events-none">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-600 to-purple-600 p-[1.5px]">
                    <div className="w-full h-full bg-zinc-900 rounded-full flex items-center justify-center text-[10px] font-bold">
                      {channelName[0]?.toUpperCase() || 'I'}
                    </div>
                  </div>
                  <span className="text-xs font-bold truncate">@{channelName}</span>
                  <span className="text-[10px] text-zinc-400">•</span>
                  <button className="pointer-events-auto px-2 py-0.5 rounded-lg border border-white/60 text-[10px] font-semibold hover:bg-white/10 transition">
                    Seguir
                  </button>
                </div>
                <p className="text-[11px] text-zinc-100 line-clamp-2 leading-tight drop-shadow font-normal">
                  {hook || 'A verdade nua e crua sobre consistência. Compartilhe com quem precisa ouvir isso!'}
                </p>
                <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-[10px] text-zinc-200">
                  <Music2 className="w-2.5 h-2.5 text-pink-400" />
                  <span className="truncate">Áudio original • @{channelName}</span>
                </div>
              </div>

              {/* Instagram Progress Bar */}
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/20 z-30">
                <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 w-3/5" />
              </div>
            </>
          )}

        </div>
      </div>

      {/* 3.5. 1-Click Quick Framing Adjuster (Garante enquadramento perfeito instantâneo sem cortar cabeças nem ir pras paredes) */}
      <div className="mt-2.5 flex items-center justify-center gap-1.5 p-1 bg-zinc-950/85 border border-zinc-800/90 rounded-xl shadow max-w-sm">
        <button
          onClick={() =>
            setQuickCropOverride({
              fmt: 'speaker_center',
              s1x: 50,
              s2x: 50,
              sY: 30,
              z: 1.0,
            })
          }
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
            effectiveFormat === 'speaker_center' && effectiveS1X === 50
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
          title="Centralizar 9:16 diretamente no orador com 100% de respiro (sem cortar cabeça nem zoom excessivo)"
        >
          <span>🎯 Centralizar (50%)</span>
        </button>

        <button
          onClick={() =>
            setQuickCropOverride({
              fmt: 'split_screen',
              s1x: 38,
              s2x: 62,
              sY: 30,
              z: 1.0,
            })
          }
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
            effectiveFormat === 'split_screen' && effectiveS1X === 38
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
          title="Split Screen calibrado para mesas de podcast (Host 38% / Convidado 62%) sem cortar queixo nem cabeças"
        >
          <span>👥 Mesa Dupla (38/62)</span>
        </button>

        <button
          onClick={() =>
            setQuickCropOverride({
              fmt: 'dynamic_reframe',
              s1x: 38,
              s2x: 62,
              sY: 30,
              z: 1.0,
            })
          }
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
            effectiveFormat === 'dynamic_reframe'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
          title="Auto-Reframe inteligente (Klap / Opus Clip): foca automaticamente em quem está falando"
        >
          <span>🔄 Auto-Reframe</span>
        </button>

        {quickCropOverride && (
          <button
            onClick={() => setQuickCropOverride(null)}
            className="px-1.5 py-1 rounded-lg text-[10px] font-semibold text-zinc-500 hover:text-zinc-300 transition"
            title="Resetar para a configuração padrão do corte"
          >
            ✕
          </button>
        )}
      </div>

      {/* 4. Bottom Controls Bar: Sound, Mode Toggle & Duration */}
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 p-2 bg-zinc-950/90 border border-zinc-800 rounded-2xl shadow-xl max-w-sm">
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition shadow-sm"
          title={isMuted ? 'Ativar Áudio do Vídeo' : 'Mutar Áudio'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-amber-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          <span>{isMuted ? 'Mudo' : 'Com Som'}</span>
        </button>

        <button
          onClick={() => setPreviewMode(previewMode === 'embed' ? 'poster' : 'embed')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
            previewMode === 'embed'
              ? 'bg-purple-950/50 border-purple-500/40 text-purple-300'
              : 'bg-yellow-950/50 border-yellow-500/40 text-yellow-300'
          }`}
          title="Alternar entre Player de Vídeo e Modo Simulação Estúdio HD"
        >
          {previewMode === 'embed' ? <Film className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
          <span>{previewMode === 'embed' ? 'Player Web' : 'Modo Estúdio'}</span>
        </button>

        <button
          onClick={() => setIsPlayingColdOpen(!isPlayingColdOpen)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
            isPlayingColdOpen
              ? 'bg-amber-500 text-black border-amber-300 shadow-md shadow-amber-900/40 animate-pulse'
              : 'bg-amber-950/50 border-amber-500/40 text-amber-300 hover:bg-amber-900/60'
          }`}
          title="Testar Gancho Cold-Open Clímax (exibe os 4s mais impactantes do meio do corte logo no início 00:00-00:04)"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isPlayingColdOpen ? '⚡ Tocando Clímax (4s)' : '⚡ Ver Gancho 4s'}</span>
        </button>

        <button
          onClick={() => setIsSubtitleVisible(!isSubtitleVisible)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
            isSubtitleVisible
              ? 'bg-amber-950/60 border-amber-500/50 text-amber-300 shadow-sm'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
          }`}
          title="Ativar ou ocultar legendas da tela (padrão: ocultas para manter o vídeo 100% limpo)"
        >
          <Type className="w-3.5 h-3.5" />
          <span>{isSubtitleVisible ? 'Legenda: Ligada' : 'Legenda: Oculta'}</span>
        </button>

        <button
          onClick={() => setShowSafeZones(!showSafeZones)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
            showSafeZones
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
          }`}
          title="Mostrar ou ocultar as guias de Zona Segura do TikTok / Shorts / Reels"
        >
          <Layout className="w-3.5 h-3.5" />
          <span>Zona Segura</span>
        </button>

        <div className="text-xs text-zinc-300 px-2 font-mono flex items-center gap-1">
          <span className="text-pink-400 font-bold">+4s</span>
          <span className="text-zinc-500">/ {duration}s</span>
        </div>
      </div>
    </div>
  );
};
