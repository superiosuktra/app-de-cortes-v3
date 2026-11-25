import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import util from 'util';
import crypto from 'crypto';
import { TEMP_DIR, BIN_DIR, getSystemFont } from '../config.js';
import {
  normalizeSafeYouTubeUrl,
  validateCutInterval,
  sanitizeTimestamp,
  parseTimeToSeconds,
  formatSecondsToTimestamp,
} from '../middleware/security.js';
import { stateManager } from './stateService.js';
import { AppError, isBotChallengeMessage, isStorageFullError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const execFilePromise = util.promisify(execFile);

export interface MediaProbeResult {
  valid: boolean;
  duration: number;
  startTimeSec: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
  vCodec?: string;
  aCodec?: string;
  fileSize: number;
  error?: string;
}

export interface YouTubeSliceMetadata {
  filePath: string;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  hasVideo: boolean;
  fileSize: number;
  requestedStartSec: number;
  requestedEndSec: number;
  actualStartSec: number;
  videoDurationSec?: number;
  vCodec?: string;
  aCodec?: string;
}

export interface TranscriptSegmentInput {
  startSec: number;
  endSec: number;
  text: string;
}

export interface SubtitleBlock {
  text: string;
  startSec: number;
  endSec: number;
}

export interface TeaserConfig {
  enabled: boolean;
  teaserDurationSec: number;
  teaserOffsetSec: number;
  absTeaserStartSec: number;
  totalDurationSec: number;
}

export function isYtDlpBotChallenge(msg: string): boolean {
  return isBotChallengeMessage(msg);
}

export function resolveUserYouTubeCookies(userId?: string): string | undefined {
  if (!userId) return process.env.YOUTUBE_COOKIES;
  const userCreds = stateManager.getCredentials(userId);
  return userCreds?.youtube?.cookies || process.env.YOUTUBE_COOKIES;
}

/**
 * Get executable path for FFmpeg (preferring system ffmpeg binary)
 */
export function getFfmpegPath(): string {
  if (fs.existsSync('/usr/bin/ffmpeg')) {
    return '/usr/bin/ffmpeg';
  }
  return 'ffmpeg';
}

/**
 * Get executable path for ffprobe
 */
export function getFfprobePath(): string {
  if (fs.existsSync('/usr/bin/ffprobe')) return '/usr/bin/ffprobe';
  if (fs.existsSync('/usr/local/bin/ffprobe')) return '/usr/local/bin/ffprobe';
  return 'ffprobe';
}

/**
 * Get executable path for yt-dlp
 */
export function getYtdlpPath(): string {
  const localProjectBin = path.join(BIN_DIR, 'yt-dlp');
  if (fs.existsSync(localProjectBin)) {
    try {
      fs.chmodSync(localProjectBin, 0o755);
    } catch {}
    return localProjectBin;
  }
  if (fs.existsSync('/usr/local/bin/yt-dlp')) {
    return '/usr/local/bin/yt-dlp';
  }
  if (fs.existsSync('/usr/bin/yt-dlp')) {
    return '/usr/bin/yt-dlp';
  }
  return 'yt-dlp';
}

/**
 * Probes a media file using ffprobe and validates video stream, optional audio stream, dimensions, and duration.
 */
export async function probeMediaFile(filePath: string): Promise<MediaProbeResult> {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      valid: false,
      duration: 0,
      startTimeSec: 0,
      hasVideo: false,
      hasAudio: false,
      width: 0,
      height: 0,
      fileSize: 0,
      error: 'Arquivo de vídeo não encontrado no disco.',
    };
  }

  let stats: fs.Stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    return {
      valid: false,
      duration: 0,
      startTimeSec: 0,
      hasVideo: false,
      hasAudio: false,
      width: 0,
      height: 0,
      fileSize: 0,
      error: 'Não foi possível ler os metadados do arquivo de vídeo.',
    };
  }

  if (stats.size === 0) {
    return {
      valid: false,
      duration: 0,
      startTimeSec: 0,
      hasVideo: false,
      hasAudio: false,
      width: 0,
      height: 0,
      fileSize: 0,
      error: 'Arquivo de vídeo gerado tem 0 bytes (vazio).',
    };
  }

  const ffprobePath = getFfprobePath();
  try {
    const { stdout } = await execFilePromise(
      ffprobePath,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration,size,start_time:stream=index,codec_type,codec_name,width,height,duration,start_time,channels,sample_rate',
        '-of',
        'json',
        filePath,
      ],
      { timeout: 15000 }
    );

    const data = JSON.parse(stdout || '{}');
    const streams = Array.isArray(data.streams) ? data.streams : [];
    const videoStream = streams.find((s: any) => s.codec_type === 'video' && s.codec_name !== 'mjpeg' && s.codec_name !== 'png')
      || streams.find((s: any) => s.codec_type === 'video');
    const audioStream = streams.find((s: any) => s.codec_type === 'audio');

    const formatDuration = Number.parseFloat(String(data.format?.duration ?? 'NaN'));
    const videoDuration = Number.parseFloat(String(videoStream?.duration ?? 'NaN'));
    const duration = Number.isFinite(formatDuration) && formatDuration > 0
      ? formatDuration
      : Number.isFinite(videoDuration) && videoDuration > 0
        ? videoDuration
        : 0;

    const rawStartTime = Number.parseFloat(String(videoStream?.start_time ?? data.format?.start_time ?? '0'));
    const startTimeSec = Number.isFinite(rawStartTime) && rawStartTime > 0 ? rawStartTime : 0;

    if (!videoStream) {
      return {
        valid: false,
        duration,
        startTimeSec,
        hasVideo: false,
        hasAudio: Boolean(audioStream),
        width: 0,
        height: 0,
        fileSize: stats.size,
        error: 'Arquivo não contém stream de vídeo válido.',
      };
    }

    const width = Number(videoStream.width || 0);
    const height = Number(videoStream.height || 0);
    if (width <= 0 || height <= 0) {
      return {
        valid: false,
        duration,
        startTimeSec,
        hasVideo: false,
        hasAudio: Boolean(audioStream),
        width,
        height,
        fileSize: stats.size,
        error: 'Stream de vídeo com dimensões inválidas (largura/altura zeradas).',
      };
    }

    if (!Number.isFinite(duration) || duration <= 0) {
      return {
        valid: false,
        duration: 0,
        startTimeSec,
        hasVideo: true,
        hasAudio: Boolean(audioStream),
        width,
        height,
        vCodec: videoStream.codec_name,
        aCodec: audioStream?.codec_name,
        fileSize: stats.size,
        error: 'Arquivo de vídeo com duração inválida ou corrompido.',
      };
    }

    // Validate audio stream if present (must have valid codec_name and sample_rate/channels when reported)
    const hasValidAudio = Boolean(
      audioStream &&
        audioStream.codec_name &&
        (audioStream.channels === undefined || Number(audioStream.channels) > 0)
    );

    return {
      valid: true,
      duration,
      startTimeSec,
      hasVideo: true,
      hasAudio: hasValidAudio,
      width,
      height,
      vCodec: videoStream.codec_name,
      aCodec: hasValidAudio ? audioStream.codec_name : undefined,
      fileSize: stats.size,
    };
  } catch (err: any) {
    logger.warn(`[FFmpegService] ffprobe validation failed`, { filePath, error: err?.message || String(err) });
    return {
      valid: false,
      duration: 0,
      startTimeSec: 0,
      hasVideo: false,
      hasAudio: false,
      width: 0,
      height: 0,
      fileSize: stats.size,
      error: `Falha na validação ffprobe: ${extractCleanProcessError(err) || 'Arquivo corrompido'}`,
    };
  }
}

/**
 * Extracts a concise, human-readable error line from an execFile error (stderr/message) without leaking full stack dumps.
 */
export function extractCleanProcessError(err: any): string {
  const stderr = String(err?.stderr || '').trim();
  if (stderr) {
    const lines = stderr
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const errorLines = lines.filter(
      (l) => /error|invalid|failed|unable|no such|not found|denied|sign in|unavailable|private|copyright/i.test(l)
    );
    const chosen = errorLines.length > 0 ? errorLines[errorLines.length - 1] : lines[lines.length - 1];
    if (chosen) {
      return chosen.slice(0, 220);
    }
  }
  const msg = String(err?.message || err || '').split(/\r?\n/)[0].trim();
  return msg.slice(0, 220);
}

/**
 * Escapes arbitrary text safely for FFmpeg drawtext `text='...'` parameter.
 * Strips control characters & characters that can break single-quoted filter strings,
 * and escapes FFmpeg special filter tokens (\, :, %, ,, ;, [, ]).
 */
export function escapeDrawtextText(raw: string): string {
  const cleaned = String(raw || '')
    .replace(/[\r\n\t]+/g, ' ')
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .replace(/['"`]/g, '') // single quotes break text='...' in FFmpeg filtergraph
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

/**
 * Cleans caption source text without stripping valid words or truncating mid-word.
 */
function normalizeSubtitleWords(rawText: string): string[] {
  const clean = String(rawText || '')
    .replace(/⚡\s*\[GANCHO[^\]]*\]:?/gi, '')
    .replace(/Início em \d{2}:\d{2}:?/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^\p{L}\p{N}\s?!.,-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  return clean.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * Splits a list of words into visual blocks of 2 to 5 words with ~30 char visual limit,
 * NEVER truncating any word in the middle.
 */
export function groupWordsIntoSubtitleLines(
  words: string[],
  options?: { minWords?: number; maxWords?: number; maxChars?: number }
): string[] {
  const minWords = options?.minWords ?? 2;
  const maxWords = options?.maxWords ?? 5;
  const maxChars = options?.maxChars ?? 30;

  if (!words.length) return [];

  const blocks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const word of words) {
    const candidateLen = current.length === 0 ? word.length : currentLen + 1 + word.length;
    if (
      current.length > 0 &&
      (current.length >= maxWords || candidateLen > maxChars)
    ) {
      blocks.push(current.join(' '));
      current = [word];
      currentLen = word.length;
    } else {
      current.push(word);
      currentLen = candidateLen;
    }
  }

  if (current.length > 0) {
    // Avoid an orphan 1-word trailing block when we can borrow from the previous block or merge safely
    if (current.length < minWords && blocks.length > 0) {
      const prevWords = blocks[blocks.length - 1].split(' ');
      const merged = [...prevWords, ...current].join(' ');
      if (prevWords.length + current.length <= maxWords && merged.length <= maxChars + 4) {
        blocks[blocks.length - 1] = merged;
      } else if (prevWords.length > minWords) {
        const borrowed = prevWords.pop()!;
        blocks[blocks.length - 1] = prevWords.join(' ');
        blocks.push([borrowed, ...current].join(' '));
      } else {
        blocks.push(current.join(' '));
      }
    } else {
      blocks.push(current.join(' '));
    }
  }

  return blocks;
}

/**
 * Builds non-repeating timed subtitle blocks:
 * - Uses timestamped transcript segments when available (clamped and shifted to the cut timeline)
 * - Otherwise distributes 2..5 word (~30 char max) blocks proportionally across totalDuration
 * - Never loops or repeats the same text across the video
 */
export function buildSubtitleBlocks({
  totalDuration,
  subtitles,
  hook,
  overlayTitle,
  teaserText,
  transcriptSegments,
  cutStartSec = 0,
  cutEndSec,
  timeOffsetSec = 0,
}: {
  totalDuration: number;
  subtitles?: string[];
  hook?: string;
  overlayTitle?: string;
  teaserText?: string;
  transcriptSegments?: TranscriptSegmentInput[];
  cutStartSec?: number;
  cutEndSec?: number;
  timeOffsetSec?: number;
}): SubtitleBlock[] {
  const effectiveEnd = cutEndSec ?? cutStartSec + totalDuration;

  // 1. Prefer real timestamped transcript segments when available
  if (Array.isArray(transcriptSegments) && transcriptSegments.length > 0) {
    const overlapping = transcriptSegments
      .filter((seg) => seg && typeof seg.text === 'string' && seg.endSec > cutStartSec && seg.startSec < effectiveEnd)
      .sort((a, b) => a.startSec - b.startSec);

    if (overlapping.length > 0) {
      const timedBlocks: SubtitleBlock[] = [];
      for (const seg of overlapping) {
        const relStart = Math.max(0, seg.startSec - cutStartSec) + timeOffsetSec;
        const relEnd = Math.min(totalDuration, Math.max(relStart + 0.4, seg.endSec - cutStartSec + timeOffsetSec));
        if (relStart >= totalDuration - 0.1) continue;

        const words = normalizeSubtitleWords(seg.text);
        const lines = groupWordsIntoSubtitleLines(words);
        if (lines.length === 0) continue;

        const totalWeight = lines.reduce((acc, l) => acc + Math.max(1, l.length), 0);
        let cursor = relStart;
        const segDur = Math.max(0.4, relEnd - relStart);
        for (let i = 0; i < lines.length; i++) {
          const share = (Math.max(1, lines[i].length) / totalWeight) * segDur;
          const bStart = Number(cursor.toFixed(2));
          const bEnd = Number(Math.min(totalDuration, i === lines.length - 1 ? relEnd : cursor + share).toFixed(2));
          if (bEnd > bStart + 0.05) {
            timedBlocks.push({ text: lines[i], startSec: bStart, endSec: bEnd });
          }
          cursor = bEnd;
        }
      }
      if (timedBlocks.length > 0) {
        return timedBlocks;
      }
    }
  }

  // 2. Fallback: build unique blocks from subtitles array or hook/title and distribute proportionally ONCE
  const rawSources: string[] = [];
  if (Array.isArray(subtitles) && subtitles.length > 0) {
    rawSources.push(subtitles.join(' '));
  } else {
    const primary = [teaserText, hook, overlayTitle].filter((s) => Boolean(s && s.trim()));
    // Deduplicate overlapping text if teaserText is already contained in hook
    const uniqueText: string[] = [];
    for (const part of primary) {
      const trimmed = String(part).trim();
      if (!uniqueText.some((u) => u.toLowerCase().includes(trimmed.toLowerCase()))) {
        uniqueText.push(trimmed);
      }
    }
    if (uniqueText.length > 0) {
      rawSources.push(uniqueText.join(' '));
    }
  }

  const words = normalizeSubtitleWords(rawSources.join(' '));
  const lines = groupWordsIntoSubtitleLines(words);
  if (lines.length === 0) {
    return [];
  }

  const startMargin = Math.min(0.2, totalDuration * 0.05);
  const endMargin = Math.max(startMargin + 0.5, totalDuration - 0.15);
  const usableDuration = Math.max(0.5, endMargin - startMargin);
  const totalWeight = lines.reduce((acc, l) => acc + Math.max(1, l.length), 0);

  const blocks: SubtitleBlock[] = [];
  let cursor = startMargin;
  for (let i = 0; i < lines.length; i++) {
    const share = (Math.max(1, lines[i].length) / totalWeight) * usableDuration;
    const bStart = Number(cursor.toFixed(2));
    const bEnd = Number(Math.min(endMargin, i === lines.length - 1 ? endMargin : cursor + share - 0.04).toFixed(2));
    if (bEnd > bStart + 0.05) {
      blocks.push({ text: lines[i], startSec: bStart, endSec: bEnd });
    }
    cursor = cursor + share;
  }

  return blocks;
}

/**
 * Builds the FFmpeg drawtext filter chain for subtitles.
 * Returns empty string when subtitleTheme === 'none' or empty.
 */
export function buildSubtitleDrawtextChain({
  subtitleTheme,
  format,
  blocks,
  fontPath,
}: {
  subtitleTheme?: string;
  format?: string;
  blocks: SubtitleBlock[];
  fontPath?: string;
}): string {
  if (!subtitleTheme || subtitleTheme === 'none' || !blocks.length) {
    return '';
  }

  let fontArg = '';
  if (fontPath) {
    const escapedFont = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    fontArg = `fontfile='${escapedFont}':`;
  }

  const subY = format === 'split_screen' ? 932 : 1360;
  const drawParts: string[] = [];

  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx];
    const escapedPhrase = escapeDrawtextText(block.text);
    if (!escapedPhrase) continue;

    let color = idx === 0 || idx % 3 === 0 ? '#fde047' : 'white';
    let styleParams = 'fontsize=48:borderw=4:bordercolor=black@0.95:shadowcolor=black@0.85:shadowx=2:shadowy=3';

    if (subtitleTheme === 'hormozi') {
      color = idx % 2 === 0 ? '#fde047' : '#a3e635';
      styleParams = 'fontsize=50:borderw=6:bordercolor=black:shadowcolor=black@0.9:shadowx=3:shadowy=4';
    } else if (subtitleTheme === 'beast') {
      color = idx % 2 === 0 ? '#22c55e' : '#38bdf8';
      styleParams = 'fontsize=48:borderw=5:bordercolor=black:shadowcolor=black@0.9:shadowx=3:shadowy=3';
    } else if (subtitleTheme === 'cyberpunk') {
      color = idx % 2 === 0 ? '#f43f5e' : '#06b6d4';
      styleParams = 'fontsize=48:borderw=4:bordercolor=#312e81:shadowcolor=black@0.9:shadowx=2:shadowy=3';
    } else if (subtitleTheme === 'submagic') {
      color = idx % 2 === 0 ? '#38bdf8' : '#fde047';
      styleParams = 'fontsize=46:box=1:boxcolor=black@0.75:boxborderw=8:borderw=3:bordercolor=black';
    } else if (subtitleTheme === 'minimalist') {
      color = 'white';
      styleParams = 'fontsize=44:borderw=2:bordercolor=black@0.7:shadowcolor=black@0.5:shadowx=1:shadowy=2';
    }

    drawParts.push(
      `drawtext=${fontArg}text='${escapedPhrase}':fontcolor=${color}:${styleParams}:x=(w-text_w)/2:y=${subY}:enable='between(t\\,${block.startSec}\\,${block.endSec})'`
    );
  }

  return drawParts.join(',');
}

/**
 * Validates and computes Cold-Open Teaser configuration:
 * - Only enabled if main duration >= 18s AND final duration (duration + teaserDur) <= 59s
 * - Prevents overlap with opening of main body (teaserOffsetSec >= teaserDur) and prevents exceeding cut/source end
 * - If teaserOffsetSec or teaserDurationSec is invalid, cleanly disables teaser instead of failing
 */
export function resolveTeaserConfig({
  startSec,
  duration,
  sourceDuration,
  teaserOffsetSec,
  teaserDurationSec,
}: {
  startSec: number;
  duration: number;
  sourceDuration: number;
  teaserOffsetSec?: number;
  teaserDurationSec?: number;
}): TeaserConfig {
  const disabled: TeaserConfig = {
    enabled: false,
    teaserDurationSec: 0,
    teaserOffsetSec: 0,
    absTeaserStartSec: startSec,
    totalDurationSec: duration,
  };

  if (!Number.isFinite(duration) || duration < 18) {
    return disabled;
  }

  // Validate teaserDurationSec
  let effectiveTeaserDur = 4;
  if (teaserDurationSec !== undefined && teaserDurationSec !== null) {
    const parsedDur = Number(teaserDurationSec);
    if (!Number.isFinite(parsedDur) || parsedDur < 1.5 || parsedDur > 8) {
      return disabled;
    }
    effectiveTeaserDur = parsedDur;
  }

  // Final output duration MUST NOT exceed 59 seconds (YouTube Shorts limit safety)
  if (duration + effectiveTeaserDur > 59) {
    return disabled;
  }

  // Validate teaserOffsetSec so it never overlaps the opening [0, teaserDur] and stays inside cut bounds
  let effectiveOffset: number;
  if (teaserOffsetSec !== undefined && teaserOffsetSec !== null) {
    const parsedOffset = Number(teaserOffsetSec);
    if (
      !Number.isFinite(parsedOffset) ||
      parsedOffset < effectiveTeaserDur ||
      parsedOffset + effectiveTeaserDur > duration
    ) {
      return disabled;
    }
    effectiveOffset = parsedOffset;
  } else {
    effectiveOffset = Math.floor(duration * 0.62);
    if (effectiveOffset < effectiveTeaserDur || effectiveOffset + effectiveTeaserDur > duration) {
      return disabled;
    }
  }

  const absTeaserStartSec = startSec + effectiveOffset;
  if (
    absTeaserStartSec < 0 ||
    absTeaserStartSec + effectiveTeaserDur > sourceDuration + 0.05 ||
    startSec + duration > sourceDuration + 0.05
  ) {
    return disabled;
  }

  return {
    enabled: true,
    teaserDurationSec: effectiveTeaserDur,
    teaserOffsetSec: effectiveOffset,
    absTeaserStartSec,
    totalDurationSec: duration + effectiveTeaserDur,
  };
}

export interface FramingOptions {
  speaker1X?: number;
  speaker1Y?: number;
  speaker2X?: number;
  speaker2Y?: number;
  zoom?: number;
  teaserOffsetSec?: number;
  teaserDurationSec?: number;
}

/**
 * Builds distortion-free FFmpeg filter complexes safe for horizontal (16:9), vertical (9:16),
 * square (1:1), and unusual aspect ratios.
 * Uses min(iw, ih*R) / min(ih, iw/R) so crop dimensions NEVER exceed input video width or height.
 */
export function buildLayoutFilter(
  format: string = 'speaker_center',
  framing?: FramingOptions,
  inputLabel: string = '[0:v]'
): string {
  const s1x = Number((Math.max(5, Math.min(95, Number(framing?.speaker1X ?? 38))) / 100).toFixed(3));
  const s1y = Number((Math.max(5, Math.min(95, Number(framing?.speaker1Y ?? 30))) / 100).toFixed(3));
  const s2x = Number((Math.max(5, Math.min(95, Number(framing?.speaker2X ?? 62))) / 100).toFixed(3));
  const s2y = Number((Math.max(5, Math.min(95, Number(framing?.speaker2Y ?? 30))) / 100).toFixed(3));
  const z = Number(Math.max(1.0, Math.min(1.15, Number(framing?.zoom ?? 1.02))).toFixed(2));

  // Safe 9:16 crop (target ratio R = 9/16): cw <= iw AND ch <= ih ALWAYS
  const fullCw = `max(2\\,trunc(min(iw\\,ih*9/16)/${z}/2)*2)`;
  const fullCh = `max(2\\,trunc(min(ih\\,iw*16/9)/${z}/2)*2)`;

  // Safe 9:8 crop per half for split_screen (each half is 1080x960, target ratio R = 9/8): cw <= iw AND ch <= ih ALWAYS
  const splitCw = `max(2\\,trunc(min(iw\\,ih*9/8)/${z}/2)*2)`;
  const splitCh = `max(2\\,trunc(min(ih\\,iw*8/9)/${z}/2)*2)`;

  // Safe 1:1 square crop
  const sqSide = `max(2\\,trunc(min(iw\\,ih)/2)*2)`;

  switch (format) {
    case 'split_screen':
      return `${inputLabel}split=2[s_top][s_bot];[s_top]crop=${splitCw}:${splitCh}:clip(iw*${s2x}-ow/2\\,0\\,max(0\\,iw-ow)):clip(ih*${s2y}-oh/2\\,0\\,max(0\\,ih-oh)),scale=1080:960:flags=lanczos[top];[s_bot]crop=${splitCw}:${splitCh}:clip(iw*${s1x}-ow/2\\,0\\,max(0\\,iw-ow)):clip(ih*${s1y}-oh/2\\,0\\,max(0\\,ih-oh)),scale=1080:960:flags=lanczos[bottom];[top][bottom]vstack=inputs=2,drawbox=x=0:y=959:w=1080:h=2:color=black@0.8:t=fill,setsar=1[v]`;

    case 'dynamic_reframe':
      return `${inputLabel}crop=${fullCw}:${fullCh}:if(lt(mod(t\\,10)\\,5)\\,clip(iw*${s2x}-ow/2\\,0\\,max(0\\,iw-ow))\\,clip(iw*${s1x}-ow/2\\,0\\,max(0\\,iw-ow))):if(lt(mod(t\\,10)\\,5)\\,clip(ih*${s2y}-oh/2\\,0\\,max(0\\,ih-oh))\\,clip(ih*${s1y}-oh/2\\,0\\,max(0\\,ih-oh))),scale=1080:1920:flags=lanczos,setsar=1[v]`;

    case 'speaker_left':
      return `${inputLabel}crop=${fullCw}:${fullCh}:clip(iw*${s1x}-ow/2\\,0\\,max(0\\,iw-ow)):clip(ih*${s1y}-oh/2\\,0\\,max(0\\,ih-oh)),scale=1080:1920:flags=lanczos,setsar=1[v]`;

    case 'speaker_right':
      return `${inputLabel}crop=${fullCw}:${fullCh}:clip(iw*${s2x}-ow/2\\,0\\,max(0\\,iw-ow)):clip(ih*${s2y}-oh/2\\,0\\,max(0\\,ih-oh)),scale=1080:1920:flags=lanczos,setsar=1[v]`;

    case 'speaker_center':
    case 'vertical_crop':
      return `${inputLabel}crop=${fullCw}:${fullCh}:clip((iw-ow)/2\\,0\\,max(0\\,iw-ow)):clip(ih*0.30-oh/2\\,0\\,max(0\\,ih-oh)),scale=1080:1920:flags=lanczos,setsar=1[v]`;

    case 'square':
      return `${inputLabel}crop=${sqSide}:${sqSide}:clip((iw-ow)/2\\,0\\,max(0\\,iw-ow)):clip((ih-oh)/2\\,0\\,max(0\\,ih-oh)),scale=1080:1080:flags=lanczos,setsar=1[v]`;

    case 'original':
      return `${inputLabel}scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v]`;

    case 'vertical_blur':
    default:
      return `${inputLabel}split=2[vb_bg][vb_fg];[vb_bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:5,drawbox=x=0:y=0:w=1080:h=1920:color=black@0.4:t=fill[bg];[vb_fg]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`;
  }
}

/**
 * Fetches the real duration (in seconds) of a YouTube video when available.
 * Returns null if duration cannot be determined without blocking the pipeline.
 */
export async function fetchYouTubeVideoDuration(videoUrl: string, userId?: string): Promise<number | null> {
  const safeYt = normalizeSafeYouTubeUrl(videoUrl);
  if (!safeYt) return null;

  // Fast lightweight check from YouTube watch page metadata first
  try {
    const res = await fetch(safeYt.canonicalUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/"lengthSeconds":"(\d+)"/);
      if (match && match[1]) {
        const secs = Number.parseInt(match[1], 10);
        if (Number.isFinite(secs) && secs > 0) {
          return secs;
        }
      }
    }
  } catch {}

  // Fallback to yt-dlp --print duration
  const ytdlpBinary = getYtdlpPath();
  let tempCookieFile: string | null = null;
  const userCookies = resolveUserYouTubeCookies(userId);
  if (userCookies) {
    try {
      tempCookieFile = path.join(TEMP_DIR, `cookies_dur_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.txt`);
      fs.writeFileSync(tempCookieFile, userCookies, { encoding: 'utf-8', mode: 0o600 });
    } catch {}
  }

  try {
    const args = [
      '--no-playlist',
      '--skip-download',
      '--print',
      'duration',
      ...(tempCookieFile ? ['--cookies', tempCookieFile] : []),
      '--',
      safeYt.canonicalUrl,
    ];
    const { stdout } = await execFilePromise(ytdlpBinary, args, { timeout: 20000 });
    const parsed = Number.parseFloat(String(stdout || '').trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  } catch {
    return null;
  } finally {
    if (tempCookieFile && fs.existsSync(tempCookieFile)) {
      try {
        fs.unlinkSync(tempCookieFile);
      } catch {}
    }
  }

  return null;
}

function cleanupPartialFilesByPrefix(dir: string, prefix: string): void {
  try {
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith(prefix)) {
        try {
          fs.unlinkSync(path.join(dir, file));
        } catch {}
      }
    }
  } catch {}
}

/**
 * Downloads a precise slice directly from a YouTube video in up to 1080p Full HD.
 * - Uses deterministic output path and rejects partial files
 * - Never generates synthetic black video or zero-filled fallback files
 * - Validates downloaded media with ffprobe (video stream required, audio checked)
 * - Returns real slice metadata (path, real duration, width, height, hasAudio, actualStartSec)
 */
export async function downloadYouTubeSlice({
  videoUrl,
  startTime,
  endTime,
  userId,
  maxIntervalSeconds = 300,
  knownVideoDurationSec,
}: {
  videoUrl: string;
  startTime: string;
  endTime: string;
  userId?: string;
  maxIntervalSeconds?: number;
  knownVideoDurationSec?: number;
}): Promise<YouTubeSliceMetadata> {
  const safeYt = normalizeSafeYouTubeUrl(videoUrl);
  if (!safeYt) {
    throw new AppError({
      code: 'YOUTUBE_DOWNLOAD_FAILED',
      statusCode: 400,
      userMessage: 'URL do YouTube inválida ou bloqueada.',
    });
  }

  const cleanStart = sanitizeTimestamp(startTime);
  const cleanEnd = sanitizeTimestamp(endTime);
  const startSec = parseTimeToSeconds(cleanStart);
  const endSec = parseTimeToSeconds(cleanEnd);
  if (startSec >= endSec) {
    throw new AppError({
      code: 'INVALID_CUT_INTERVAL',
      statusCode: 400,
      userMessage: 'O tempo final deve ser maior que o tempo inicial.',
    });
  }
  const intervalCheck = validateCutInterval(cleanStart, cleanEnd, maxIntervalSeconds);
  if (!intervalCheck.valid) {
    throw new AppError({
      code: 'INVALID_CUT_INTERVAL',
      statusCode: 400,
      userMessage: intervalCheck.error || 'Intervalo de tempo inválido.',
    });
  }

  // Validate against real source video duration when available
  const videoDurationSec =
    typeof knownVideoDurationSec === 'number' && knownVideoDurationSec > 0
      ? knownVideoDurationSec
      : await fetchYouTubeVideoDuration(safeYt.canonicalUrl, userId);

  if (videoDurationSec && videoDurationSec > 0 && endSec > videoDurationSec) {
    throw new AppError({
      code: 'INVALID_CUT_INTERVAL',
      statusCode: 400,
      userMessage: `O tempo final (${cleanEnd}) excede a duração real do vídeo (${formatSecondsToTimestamp(videoDurationSec)}).`,
      details: { endSec, videoDurationSec },
    });
  }

  const requestToken = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const filePrefix = `yt_slice_${requestToken}`;
  const deterministicOutPath = path.join(TEMP_DIR, `${filePrefix}.mp4`);
  const ffmpegPath = getFfmpegPath();
  const ffmpegDir = path.dirname(ffmpegPath);
  const ytdlpBinary = getYtdlpPath();
  const nodePath = process.execPath;

  logger.info('[YouTube Downloader] Baixando trecho do YouTube', {
    action: 'youtube_download_start',
    videoId: safeYt.videoId,
    startTime: cleanStart,
    endTime: cleanEnd,
    userId,
  });

  let tempCookieFile: string | null = null;
  const userCookies = resolveUserYouTubeCookies(userId);
  if (userCookies) {
    try {
      tempCookieFile = path.join(TEMP_DIR, `cookies_${requestToken}.txt`);
      fs.writeFileSync(tempCookieFile, userCookies, { encoding: 'utf-8', mode: 0o600 });
    } catch {}
  }

  const ytdlpArgs = [
    '--no-playlist',
    '--no-part',
    '--merge-output-format',
    'mp4',
    '--remux-video',
    'mp4',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '--extractor-args',
    'youtube:player_client=android,web',
    '--js-runtimes',
    `node:${nodePath}`,
    '--ffmpeg-location',
    ffmpegDir,
    ...(tempCookieFile ? ['--cookies', tempCookieFile] : []),
    '-f',
    'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
    '--download-sections',
    `*${cleanStart}-${cleanEnd}`,
    '-o',
    deterministicOutPath,
    '--',
    safeYt.canonicalUrl,
  ];

  try {
    try {
      await execFilePromise(ytdlpBinary, ytdlpArgs, { timeout: 150000 });
    } catch (directErr: any) {
      const directCombined = `${directErr?.message || ''}\n${directErr?.stderr || ''}`;
      if (isBotChallengeMessage(directCombined) || isStorageFullError(directErr)) {
        throw directErr;
      }
      logger.warn('[YouTube Downloader] Tentativa direta falhou, tentando via python3', {
        error: extractCleanProcessError(directErr),
      });
      await execFilePromise('python3', [ytdlpBinary, ...ytdlpArgs], { timeout: 150000 });
    }

    // Strict deterministic file verification (never accept .part, .ytdl, or files from other requests)
    if (!fs.existsSync(deterministicOutPath)) {
      cleanupPartialFilesByPrefix(TEMP_DIR, filePrefix);
      throw new AppError({
        code: 'YOUTUBE_DOWNLOAD_FAILED',
        statusCode: 502,
        userMessage: 'O downloader do YouTube concluiu sem gerar o arquivo MP4 esperado.',
      });
    }

    // Validate downloaded media with ffprobe before considering it valid
    const probe = await probeMediaFile(deterministicOutPath);
    if (!probe.valid || !probe.hasVideo) {
      cleanupPartialFilesByPrefix(TEMP_DIR, filePrefix);
      throw new AppError({
        code: 'INVALID_MEDIA',
        statusCode: 400,
        userMessage: probe.error || 'O trecho baixado do YouTube não possui um stream de vídeo válido.',
      });
    }

    logger.info('[YouTube Downloader] Trecho validado com ffprobe', {
      action: 'youtube_download_success',
      videoId: safeYt.videoId,
      duration: probe.duration,
      width: probe.width,
      height: probe.height,
      hasAudio: probe.hasAudio,
      fileSize: probe.fileSize,
    });

    return {
      filePath: deterministicOutPath,
      duration: probe.duration,
      width: probe.width,
      height: probe.height,
      hasAudio: probe.hasAudio,
      hasVideo: probe.hasVideo,
      fileSize: probe.fileSize,
      requestedStartSec: startSec,
      requestedEndSec: endSec,
      actualStartSec: probe.startTimeSec,
      videoDurationSec: videoDurationSec ?? undefined,
      vCodec: probe.vCodec,
      aCodec: probe.aCodec,
    };
  } catch (err: any) {
    cleanupPartialFilesByPrefix(TEMP_DIR, filePrefix);

    if (err instanceof AppError) {
      throw err;
    }

    const combined = `${err?.message || ''}\n${err?.stderr || ''}`;
    if (isStorageFullError(err)) {
      throw new AppError({
        code: 'STORAGE_FULL',
        statusCode: 507,
        userMessage: 'Espaço insuficiente em disco para baixar o trecho do YouTube.',
        internalMessage: extractCleanProcessError(err),
        cause: err,
      });
    }

    if (isBotChallengeMessage(combined)) {
      throw new AppError({
        code: 'YOUTUBE_BLOCKED',
        statusCode: 422,
        userMessage:
          'O YouTube bloqueou o download automático neste servidor (verificação anti-bot). Salve seus cookies do YouTube na Central de Conexões ou envie o vídeo localmente.',
        internalMessage: extractCleanProcessError(err),
        cause: err,
      });
    }

    const detail = extractCleanProcessError(err);
    throw new AppError({
      code: 'YOUTUBE_DOWNLOAD_FAILED',
      statusCode: 502,
      userMessage: detail
        ? `Falha no download do YouTube: ${detail}`
        : 'Falha ao baixar o vídeo do YouTube. Verifique se o vídeo está público e acessível.',
      internalMessage: detail,
      cause: err,
    });
  } finally {
    if (tempCookieFile && fs.existsSync(tempCookieFile)) {
      try {
        fs.unlinkSync(tempCookieFile);
      } catch {}
    }
  }
}

/**
 * Downloads a YouTube video slice AND renders it using real slice metadata and temporal alignment.
 */
export async function downloadAndProcessYouTubeCut({
  videoUrl,
  startTime,
  endTime,
  format = 'speaker_center',
  subtitleTheme = 'none',
  overlayTitle = '',
  hook = '',
  framing,
  subtitles,
  transcriptSegments,
  teaserOffsetSec,
  teaserDurationSec,
  teaserText,
  partBadge,
  removeSilence = false,
  userId,
}: {
  videoUrl: string;
  startTime: string;
  endTime: string;
  format?: string;
  subtitleTheme?: string;
  overlayTitle?: string;
  hook?: string;
  framing?: FramingOptions;
  subtitles?: string[];
  transcriptSegments?: TranscriptSegmentInput[];
  teaserOffsetSec?: number;
  teaserDurationSec?: number;
  teaserText?: string;
  partBadge?: string;
  removeSilence?: boolean;
  userId?: string;
}): Promise<string> {
  let sliceMeta: YouTubeSliceMetadata | null = null;
  try {
    sliceMeta = await downloadYouTubeSlice({ videoUrl, startTime, endTime, userId });

    const requestedDuration = Math.max(1, sliceMeta.requestedEndSec - sliceMeta.requestedStartSec);
    const effectiveDuration = Math.min(requestedDuration, sliceMeta.duration);

    const renderedPath = await renderRealCutVideo({
      inputFilePath: sliceMeta.filePath,
      startTime: '00:00',
      endTime: formatSecondsToTimestamp(Math.ceil(effectiveDuration)),
      durationOverrideSec: effectiveDuration,
      sourceStartOffsetSec: 0,
      originalCutStartSec: sliceMeta.requestedStartSec,
      format,
      subtitleTheme,
      overlayTitle,
      hook,
      framing,
      subtitles,
      transcriptSegments,
      teaserOffsetSec,
      teaserDurationSec,
      teaserText,
      partBadge,
      removeSilence,
    });

    return renderedPath;
  } finally {
    if (sliceMeta?.filePath && fs.existsSync(sliceMeta.filePath)) {
      try {
        fs.unlinkSync(sliceMeta.filePath);
      } catch {}
    }
  }
}

/**
 * Renders a video cut using FFmpeg with:
 * - ffprobe pre-validation (dimensions, real duration, audio stream detection)
 * - Safe crop expressions for vertical, horizontal, square, and unusual aspect ratios
 * - Safe Cold-Open Teaser validation (<= 59s final duration, no overlap, disables cleanly if invalid)
 * - Clean non-repeating subtitles (2-5 words, <= 30 chars, no mid-word truncation, escaped drawtext, skipped when theme === 'none')
 * - Audio-aware processing (silent stereo track when input has no audio; never applies highpass/loudnorm to missing audio)
 * - Partial output cleanup and specific AppError on failure
 */
export async function renderRealCutVideo({
  inputFilePath,
  startTime,
  endTime,
  outputPath,
  durationOverrideSec,
  sourceStartOffsetSec = 0,
  originalCutStartSec,
  format = 'speaker_center',
  subtitleTheme = 'none',
  overlayTitle = '',
  hook = '',
  framing,
  subtitles,
  transcriptSegments,
  teaserOffsetSec,
  teaserDurationSec,
  teaserText,
  partBadge: _partBadge,
  removeSilence = false,
}: {
  inputFilePath: string;
  startTime: string;
  endTime: string;
  outputPath?: string;
  durationOverrideSec?: number;
  sourceStartOffsetSec?: number;
  originalCutStartSec?: number;
  format?: string;
  subtitleTheme?: string;
  overlayTitle?: string;
  hook?: string;
  framing?: FramingOptions;
  subtitles?: string[];
  transcriptSegments?: TranscriptSegmentInput[];
  teaserOffsetSec?: number;
  teaserDurationSec?: number;
  teaserText?: string;
  partBadge?: string;
  removeSilence?: boolean;
}): Promise<string> {
  const sourceProbe = await probeMediaFile(inputFilePath);
  if (!sourceProbe.valid || !sourceProbe.hasVideo) {
    throw new AppError({
      code: 'INVALID_MEDIA',
      statusCode: 400,
      userMessage: sourceProbe.error || 'O arquivo de vídeo fonte é inválido ou não possui stream de vídeo.',
    });
  }

  const parsedStart = parseTimeToSeconds(startTime || '00:00');
  const parsedEnd = parseTimeToSeconds(endTime || '00:30');
  if (Number.isNaN(parsedStart) || Number.isNaN(parsedEnd)) {
    throw new AppError({
      code: 'INVALID_CUT_INTERVAL',
      statusCode: 400,
      userMessage: 'Timestamps de início ou fim inválidos.',
    });
  }

  const startSec = Math.max(0, parsedStart - sourceStartOffsetSec);
  let duration: number;

  if (typeof durationOverrideSec === 'number' && Number.isFinite(durationOverrideSec) && durationOverrideSec > 0) {
    duration = Math.min(durationOverrideSec, Math.max(0.5, sourceProbe.duration - startSec));
  } else {
    const endSec = parsedEnd - sourceStartOffsetSec;
    if (endSec <= startSec) {
      throw new AppError({
        code: 'INVALID_CUT_INTERVAL',
        statusCode: 400,
        userMessage: 'O tempo final do corte deve ser maior que o tempo inicial.',
      });
    }
    if (startSec >= sourceProbe.duration) {
      throw new AppError({
        code: 'INVALID_CUT_INTERVAL',
        statusCode: 400,
        userMessage: `O tempo inicial (${startTime}) excede a duração real do vídeo (${formatSecondsToTimestamp(sourceProbe.duration)}).`,
      });
    }
    if (endSec > sourceProbe.duration + 0.25) {
      throw new AppError({
        code: 'INVALID_CUT_INTERVAL',
        statusCode: 400,
        userMessage: `O tempo final (${endTime}) excede a duração real do vídeo (${formatSecondsToTimestamp(sourceProbe.duration)}).`,
      });
    }
    duration = Math.min(endSec - startSec, sourceProbe.duration - startSec);
  }

  if (duration < 0.5) {
    throw new AppError({
      code: 'INVALID_CUT_INTERVAL',
      statusCode: 400,
      userMessage: 'Duração efetiva do corte é menor que o mínimo suportado.',
    });
  }

  const randomSuffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const outPath = outputPath || path.join(TEMP_DIR, `cut_${randomSuffix}.mp4`);
  const fontPath = getSystemFont();
  const ffmpegCmd = getFfmpegPath();
  const hasAudio = sourceProbe.hasAudio;
  const effectiveCutStartForTranscript = originalCutStartSec ?? parsedStart;

  const teaserConfig = resolveTeaserConfig({
    startSec,
    duration,
    sourceDuration: sourceProbe.duration,
    teaserOffsetSec: teaserOffsetSec ?? framing?.teaserOffsetSec,
    teaserDurationSec: teaserDurationSec ?? framing?.teaserDurationSec,
  });

  const silenceFilter = removeSilence
    ? ',silenceremove=stop_periods=-1:stop_duration=0.35:stop_threshold=-32dB'
    : '';
  const audioEnhanceFilter = `highpass=f=80,loudnorm=I=-14:TP=-1.5:LRA=11${silenceFilter}`;

  // Attempt Cold-Open Teaser render when valid & enabled
  if (teaserConfig.enabled) {
    const teaserDur = teaserConfig.teaserDurationSec;
    const totalDurationWithTeaser = teaserConfig.totalDurationSec;

    const subtitleBlocks =
      subtitleTheme && subtitleTheme !== 'none'
        ? buildSubtitleBlocks({
            totalDuration: totalDurationWithTeaser,
            subtitles,
            hook,
            overlayTitle,
            teaserText,
            transcriptSegments,
            cutStartSec: effectiveCutStartForTranscript,
            cutEndSec: effectiveCutStartForTranscript + duration,
            timeOffsetSec: teaserDur,
          })
        : [];
    const subtitleChain = buildSubtitleDrawtextChain({
      subtitleTheme,
      format,
      blocks: subtitleBlocks,
      fontPath,
    });

    const layoutChain = buildLayoutFilter(format, framing, '[raw_v]');
    const finalVLabel = subtitleChain ? '[vout]' : '[v]';

    let coldOpenFilterComplex: string;
    const coldOpenArgs: string[] = [
      '-y',
      '-ss',
      String(Number(teaserConfig.absTeaserStartSec.toFixed(3))),
      '-t',
      String(Number(teaserDur.toFixed(3))),
      '-i',
      inputFilePath,
      '-ss',
      String(Number(startSec.toFixed(3))),
      '-t',
      String(Number(duration.toFixed(3))),
      '-i',
      inputFilePath,
    ];

    if (hasAudio) {
      const fadeStart = Math.max(0, teaserDur - 0.15).toFixed(2);
      coldOpenFilterComplex = `[0:v]setpts=PTS-STARTPTS[v0];[0:a]asetpts=PTS-STARTPTS,afade=t=out:st=${fadeStart}:d=0.15[a0];[1:v]setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.2[v1];[1:a]asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.15[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[raw_v][raw_a];[raw_a]${audioEnhanceFilter}[aout];${layoutChain}${subtitleChain ? `;[v]${subtitleChain}[vout]` : ''}`;
      coldOpenArgs.push('-filter_complex', coldOpenFilterComplex, '-map', finalVLabel, '-map', '[aout]');
    } else {
      // No audio stream: add silent stereo track BEFORE -filter_complex and concatenate video-only
      coldOpenArgs.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
      coldOpenFilterComplex = `[0:v]setpts=PTS-STARTPTS[v0];[1:v]setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.2[v1];[v0][v1]concat=n=2:v=1:a=0[raw_v];${layoutChain}${subtitleChain ? `;[v]${subtitleChain}[vout]` : ''}`;
      coldOpenArgs.push('-filter_complex', coldOpenFilterComplex, '-map', finalVLabel, '-map', '2:a', '-shortest');
    }

    coldOpenArgs.push(
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-b:v',
      '6500k',
      '-maxrate',
      '9000k',
      '-bufsize',
      '14000k',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      outPath
    );

    try {
      await execFilePromise(ffmpegCmd, coldOpenArgs, { timeout: 180000 });
      const postProbe = await probeMediaFile(outPath);
      if (postProbe.valid && postProbe.hasVideo) {
        return outPath;
      }
      if (fs.existsSync(outPath)) {
        try { fs.unlinkSync(outPath); } catch {}
      }
    } catch (coldOpenErr: any) {
      if (fs.existsSync(outPath)) {
        try { fs.unlinkSync(outPath); } catch {}
      }
      if (isStorageFullError(coldOpenErr)) {
        throw new AppError({
          code: 'STORAGE_FULL',
          statusCode: 507,
          userMessage: 'Espaço insuficiente em disco durante a renderização do vídeo.',
          internalMessage: extractCleanProcessError(coldOpenErr),
          cause: coldOpenErr,
        });
      }
      logger.warn('[FFmpeg] Cold-open concat falhou, prosseguindo com renderização direta sem teaser', {
        error: extractCleanProcessError(coldOpenErr),
      });
    }
  }

  // Standard clean render (with proper PTS reset for temporal alignment)
  const subtitleBlocks =
    subtitleTheme && subtitleTheme !== 'none'
      ? buildSubtitleBlocks({
          totalDuration: duration,
          subtitles,
          hook,
          overlayTitle,
          teaserText,
          transcriptSegments,
          cutStartSec: effectiveCutStartForTranscript,
          cutEndSec: effectiveCutStartForTranscript + duration,
          timeOffsetSec: 0,
        })
      : [];
  const subtitleChain = buildSubtitleDrawtextChain({
    subtitleTheme,
    format,
    blocks: subtitleBlocks,
    fontPath,
  });

  const baseLayout = buildLayoutFilter(format, framing, '[src_v]');
  let filterComplex = `[0:v]setpts=PTS-STARTPTS[src_v];${baseLayout}`;
  let outputMapLabel = '[v]';
  if (subtitleChain) {
    filterComplex += `;[v]${subtitleChain}[vout]`;
    outputMapLabel = '[vout]';
  }

  const ffmpegArgs: string[] = [
    '-y',
    '-ss',
    String(Number(startSec.toFixed(3))),
    '-t',
    String(Number(duration.toFixed(3))),
    '-i',
    inputFilePath,
  ];

  if (!hasAudio) {
    // Input must appear BEFORE -filter_complex and -map
    ffmpegArgs.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
  }

  ffmpegArgs.push('-filter_complex', filterComplex, '-map', outputMapLabel);

  if (hasAudio) {
    ffmpegArgs.push('-map', '0:a:0', '-af', `asetpts=PTS-STARTPTS,${audioEnhanceFilter}`);
  } else {
    ffmpegArgs.push('-map', '1:a', '-shortest');
  }

  ffmpegArgs.push(
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-b:v',
    '6500k',
    '-maxrate',
    '9000k',
    '-bufsize',
    '14000k',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    outPath
  );

  try {
    await execFilePromise(ffmpegCmd, ffmpegArgs, { timeout: 180000 });

    const postProbe = await probeMediaFile(outPath);
    if (!postProbe.valid || !postProbe.hasVideo) {
      if (fs.existsSync(outPath)) {
        try { fs.unlinkSync(outPath); } catch {}
      }
      throw new AppError({
        code: 'FFMPEG_FAILED',
        statusCode: 500,
        userMessage: `O arquivo renderizado falhou na validação de integridade: ${postProbe.error || 'mídia inválida'}.`,
      });
    }

    return outPath;
  } catch (err: any) {
    if (fs.existsSync(outPath)) {
      try {
        fs.unlinkSync(outPath);
      } catch {}
    }
    if (err instanceof AppError) {
      throw err;
    }
    if (isStorageFullError(err)) {
      throw new AppError({
        code: 'STORAGE_FULL',
        statusCode: 507,
        userMessage: 'Espaço insuficiente em disco durante a renderização do corte.',
        internalMessage: extractCleanProcessError(err),
        cause: err,
      });
    }
    const causeMsg = extractCleanProcessError(err);
    throw new AppError({
      code: 'FFMPEG_FAILED',
      statusCode: 500,
      userMessage: causeMsg
        ? `Falha na renderização FFmpeg: ${causeMsg}`
        : 'Falha ao renderizar o vídeo no FFmpeg.',
      internalMessage: causeMsg,
      cause: err,
    });
  }
}

/**
 * Generates an FFmpeg command for export or local user execution with Opus Clip / Klap layouts
 */
export function generateFfmpegCommand({
  videoUrl,
  startTime,
  endTime,
  format = 'split_screen',
  title,
  framing,
}: {
  videoUrl: string;
  startTime: string;
  endTime: string;
  format?: string;
  title?: string;
  framing?: FramingOptions;
}) {
  const startSec = parseTimeToSeconds(startTime || '00:00');
  const endSec = parseTimeToSeconds(endTime || '00:45');
  const duration = Math.max(1, endSec - startSec);

  const layoutFilter = buildLayoutFilter(format, framing);
  const safeTitle = (title || 'corte_viral').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const outputFile = `${safeTitle}_${startSec}s-${endSec}s_1080p.mp4`;

  const isWindows = process.platform === 'win32';
  const rmCmd = isWindows ? 'del raw.mp4' : 'rm raw.mp4';

  const fullCommand = `yt-dlp -f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best" --download-sections "*${startTime}-${endTime}" "${videoUrl}" -o "raw.mp4" && ffmpeg -i "raw.mp4" -filter_complex "${layoutFilter}" -map "[v]" -map 0:a? -af "highpass=f=80,loudnorm=I=-14:TP=-1.5:LRA=11" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -b:v 6500k -c:a aac -b:a 192k -movflags +faststart "${outputFile}" && ${rmCmd}`;

  return {
    command: fullCommand,
    outputFile,
    startSec,
    endSec,
    duration,
  };
}
