import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';
import { YoutubeTranscript } from 'youtube-transcript';
import { TEMP_DIR } from '../config.js';
import { getYtdlpPath } from './ffmpegService.js';

const execFilePromise = util.promisify(execFile);

export interface TranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
}

export interface HeatmapMarker {
  startSec: number;
  durationSec: number;
  score: number;
}

export interface CachedTranscriptResult {
  videoId: string;
  transcript: string;
  count: number;
  hasRealCaptions: boolean;
  segments: TranscriptSegment[];
  heatmap: HeatmapMarker[];
  videoDurationSec?: number;
  message?: string;
  cachedAt?: number;
}

const TRANSCRIPT_CACHE_MAX = 100;
const TRANSCRIPT_CACHE_TTL_MS = 30 * 60 * 1000;
const transcriptMemoryCache = new Map<string, CachedTranscriptResult>();

export function extractVideoId(urlOrId: string): string | null {
  const text = (urlOrId || '').trim();
  const match = text.match(/(?:v=|\/v\/|embed\/|youtu\.be\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  return null;
}

export function formatSecondsToMMSS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${m.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`;
}

export async function fetchVideoMetadata(videoId: string) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let title = 'Vídeo do YouTube';
  let author = 'Canal do YouTube';

  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (oembedRes.ok) {
      const oembedData: any = await oembedRes.json();
      title = oembedData?.title || title;
      author = oembedData?.author_name || author;
    }
  } catch (e) {
    console.warn('[TranscriptService] oEmbed fetch warning:', e);
  }

  const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const fallbackThumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  return {
    videoId,
    videoUrl,
    title,
    author,
    thumbnail,
    fallbackThumbnail,
  };
}

export async function fetchYouTubeHeatmapAndDuration(videoId: string): Promise<{
  heatmap: HeatmapMarker[];
  videoDurationSec: number;
}> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { heatmap: [], videoDurationSec: 0 };

    const html = await res.text();
    let videoDurationSec = 0;
    const lenMatch = html.match(/"lengthSeconds":"(\d+)"/);
    if (lenMatch) {
      videoDurationSec = parseInt(lenMatch[1], 10) || 0;
    }

    const heatmap: HeatmapMarker[] = [];
    const markerIdx = html.indexOf('"MARKER_TYPE_HEATMAP"');
    if (markerIdx !== -1) {
      const slice = html.slice(markerIdx, markerIdx + 35000);
      const markersMatch = slice.match(/"markers":(\[\{.*?\}\])/);
      if (markersMatch) {
        try {
          const rawMarkers = JSON.parse(markersMatch[1]);
          if (Array.isArray(rawMarkers)) {
            for (const m of rawMarkers) {
              const startSec = Number(m.startMillis || 0) / 1000;
              const durationSec = Number(m.durationMillis || 0) / 1000;
              const score = Number(m.intensityScoreNormalized || 0);
              if (!isNaN(startSec) && !isNaN(score)) {
                heatmap.push({ startSec, durationSec, score });
              }
            }
          }
        } catch {}
      }
    }

    return { heatmap, videoDurationSec };
  } catch {
    return { heatmap: [], videoDurationSec: 0 };
  }
}

export async function extractSubtitlesViaYtdlp(videoId: string): Promise<TranscriptSegment[]> {
  const ytdlpBinary = getYtdlpPath();
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const randomId = `${videoId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const outPrefix = path.join(TEMP_DIR, `subs_${randomId}`);

  const tryLangs = ['pt,pt-BR', 'en,es'];
  try {
    for (const langArg of tryLangs) {
      try {
        await execFilePromise(
          ytdlpBinary,
          [
            '--no-playlist',
            '--ignore-errors',
            '--extractor-args',
            'youtube:player_client=android,web;player_skip=webpage,configs',
            '--write-auto-subs',
            '--write-subs',
            '--sub-lang',
            langArg,
            '--sub-format',
            'json3',
            '--skip-download',
            '-o',
            outPrefix,
            videoUrl,
          ],
          { timeout: 25000 }
        );
      } catch {}

      const files = fs
        .readdirSync(TEMP_DIR)
        .filter((f) => f.startsWith(`subs_${randomId}`) && f.endsWith('.json3'));

      if (files.length > 0) {
        const filePath = path.join(TEMP_DIR, files[0]);
        const rawJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const events: any[] = Array.isArray(rawJson?.events) ? rawJson.events : [];

        const rawPhrases: TranscriptSegment[] = [];
        for (const ev of events) {
          if (!Array.isArray(ev.segs)) continue;
          const text = ev.segs
            .map((s: any) => s.utf8 || '')
            .join('')
            .replace(/\s+/g, ' ')
            .trim();
          if (!text || /^\[.*\]$/.test(text)) continue;

          const startSec = Math.max(0, Number(ev.tStartMs || 0) / 1000);
          const durSec = Math.max(1.5, Number(ev.dDurationMs || 3000) / 1000);
          rawPhrases.push({
            startSec,
            endSec: startSec + durSec,
            text,
          });
        }

        for (let k = 0; k < rawPhrases.length - 1; k++) {
          const nextStart = rawPhrases[k + 1].startSec;
          if (nextStart > rawPhrases[k].startSec) {
            rawPhrases[k].endSec = Math.min(rawPhrases[k].endSec, nextStart);
          }
        }

        const merged: TranscriptSegment[] = [];
        let current: TranscriptSegment | null = null;
        for (const p of rawPhrases) {
          if (!current) {
            current = { ...p };
            continue;
          }
          const combinedDur = p.endSec - current.startSec;
          const combinedWords = `${current.text} ${p.text}`.split(/\s+/).length;
          if (combinedDur <= 6.0 && combinedWords <= 20) {
            current.text = `${current.text} ${p.text}`.replace(/\s+/g, ' ').trim();
            current.endSec = Math.max(current.endSec, p.endSec);
          } else {
            merged.push(current);
            current = { ...p };
          }
        }
        if (current) merged.push(current);

        if (merged.length > 0) {
          return merged;
        }
      }
    }
  } finally {
    try {
      const leftover = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(`subs_${randomId}`));
      for (const f of leftover) {
        fs.unlinkSync(path.join(TEMP_DIR, f));
      }
    } catch {}
  }

  return [];
}

function setTranscriptMemoryCache(videoId: string, entry: CachedTranscriptResult): void {
  const now = Date.now();
  for (const [key, val] of transcriptMemoryCache.entries()) {
    if (val.cachedAt && now - val.cachedAt > TRANSCRIPT_CACHE_TTL_MS) {
      transcriptMemoryCache.delete(key);
    }
  }
  if (transcriptMemoryCache.size >= TRANSCRIPT_CACHE_MAX) {
    const oldestKey = transcriptMemoryCache.keys().next().value;
    if (oldestKey !== undefined) transcriptMemoryCache.delete(oldestKey);
  }
  transcriptMemoryCache.set(videoId, entry);
}

export async function fetchTranscript(videoId: string): Promise<CachedTranscriptResult> {
  if (transcriptMemoryCache.has(videoId)) {
    const entry = transcriptMemoryCache.get(videoId)!;
    if (entry.cachedAt && Date.now() - entry.cachedAt <= TRANSCRIPT_CACHE_TTL_MS) {
      return entry;
    }
    transcriptMemoryCache.delete(videoId);
  }

  const diskCacheFile = path.join(TEMP_DIR, `transcript_v3_${videoId}.json`);
  if (fs.existsSync(diskCacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(diskCacheFile, 'utf8'));
      if (cached && cached.hasRealCaptions && Array.isArray(cached.segments) && cached.segments.length > 5) {
        const withTs: CachedTranscriptResult = { ...cached, cachedAt: Date.now() };
        setTranscriptMemoryCache(videoId, withTs);
        return withTs;
      }
    } catch {}
  }

  const [{ heatmap, videoDurationSec }, ytdlpSegments] = await Promise.all([
    fetchYouTubeHeatmapAndDuration(videoId),
    extractSubtitlesViaYtdlp(videoId),
  ]);

  let segments: TranscriptSegment[] = ytdlpSegments;

  if (segments.length === 0) {
    try {
      const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId, {
        lang: 'pt',
      }).catch(async () => {
        return await YoutubeTranscript.fetchTranscript(videoId);
      });

      if (transcriptItems && transcriptItems.length > 0) {
        segments = transcriptItems.map((item) => {
          const startSec = Math.floor(item.offset / 1000);
          const durSec = Math.max(2, Math.floor((item.duration || 4000) / 1000));
          return {
            startSec,
            endSec: startSec + durSec,
            text: item.text
              .replace(/&amp;/g, '&')
              .replace(/&#39;/g, "'")
              .replace(/\s+/g, ' ')
              .trim(),
          };
        });
      }
    } catch {}
  }

  if (segments.length > 0) {
    const formattedLines = segments.map((seg) => `[${formatSecondsToMMSS(seg.startSec)}] ${seg.text}`);
    const result: CachedTranscriptResult = {
      videoId,
      transcript: formattedLines.join('\n'),
      count: segments.length,
      hasRealCaptions: true,
      segments,
      heatmap,
      videoDurationSec,
      cachedAt: Date.now(),
    };
    setTranscriptMemoryCache(videoId, result);
    try {
      fs.writeFileSync(diskCacheFile, JSON.stringify(result), 'utf8');
    } catch {}
    return result;
  }

  return {
    videoId,
    transcript: '',
    count: 0,
    hasRealCaptions: false,
    segments: [],
    heatmap,
    videoDurationSec,
    message:
      'Este vídeo não possui legendas públicas automáticas ou o YouTube restringiu o acesso. Você pode digitar/colar o texto da fala ou pedir para a IA analisar pelo tema e metadados.',
  };
}
