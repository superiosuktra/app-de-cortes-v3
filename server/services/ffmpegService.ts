import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import util from 'util';
import crypto from 'crypto';
import { TEMP_DIR, BIN_DIR, getSystemFont } from '../config.js';
import { parseTimeToSeconds } from './geminiService.js';
import {
  normalizeSafeYouTubeUrl,
  validateCutInterval,
  sanitizeTimestamp,
} from '../middleware/security.js';

const execFilePromise = util.promisify(execFile);

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
 * Escapes a string to be safely written into a temporary text file or filter for FFmpeg
 */
/**
 * Escapes a string to be safely used in FFmpeg drawtext (strips emojis so Arial never renders tofu □ boxes)
 */
function sanitizeCleanCaptionText(text: string, maxLength: number = 22): string {
  return (text || '')
    .replace(/\[[^\]]*\]/g, '') // remove [PARTE 1] etc.
    .replace(/[^\p{L}\p{N}\s?!]/gu, ' ') // strip emojis & special symbols
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

function buildShortTwoWordChunks(hookOrTitle: string): string[] {
  const clean = (hookOrTitle || '')
    .replace(/⚡\s*\[GANCHO[^\]]*\]:?/gi, '')
    .replace(/Início em \d{2}:\d{2}:?/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^\p{L}\p{N}\s?!]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const words = clean.split(/\s+/).filter((w) => w.length > 0);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length && chunks.length < 16) {
    const w1 = words[i];
    const w2 = words[i + 1] || '';
    if (w2 && `${w1} ${w2}`.length <= 16) {
      chunks.push(`${w1} ${w2}`);
      i += 2;
    } else {
      chunks.push(w1.slice(0, 16));
      i += 1;
    }
  }
  return chunks.length > 0 ? chunks : ['PRESTE ATENCAO', 'OLHA ISSO', 'ATE O FIM'];
}

function formatSecondsToMMSS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${m.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`;
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
 * Builds distortion-free FFmpeg filter complexes based on viral clipping platform standards (Opus Clip / Submagic / Klap)
 * Guarantees exact 1:1 pixel aspect ratio (9:8 for each half of split_screen, 9:16 for full vertical crops) and clean screen without clutter.
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

  // For 9:16 full-screen vertical (1080x1920): crop aspect ratio is exactly 9/16 (0.5625)
  const fullCh = `trunc(ih/${z}/2)*2`;
  const fullCw = `trunc(ih/${z}*9/16/2)*2`;

  // For 9:8 half-screen split_screen (each half is 1080x960): crop aspect ratio MUST be 9/8 (1.125) to prevent horizontal stretching!
  const splitCh = `trunc(ih/${z}/2)*2`;
  const splitCw = `trunc(ih/${z}*9/8/2)*2`;

  switch (format) {
    case 'split_screen':
      // Dual-camera stacked layout with exact 9:8 crop per half, full natural headroom (ih*sY) and subtle 2px dark divider
      return `${inputLabel}split=2[s_top][s_bot];[s_top]crop=${splitCw}:${splitCh}:clip(iw*${s2x}-ow/2\\,0\\,iw-ow):clip(ih*${s2y}-oh/2\\,0\\,ih-oh),scale=1080:960:flags=lanczos[top];[s_bot]crop=${splitCw}:${splitCh}:clip(iw*${s1x}-ow/2\\,0\\,iw-ow):clip(ih*${s1y}-oh/2\\,0\\,ih-oh),scale=1080:960:flags=lanczos[bottom];[top][bottom]vstack=inputs=2,drawbox=x=0:y=959:w=1080:h=2:color=black@0.8:t=fill,setsar=1[v]`;

    case 'dynamic_reframe':
      return `${inputLabel}crop=${fullCw}:${fullCh}:if(lt(mod(t\\,10)\\,5)\\,clip(iw*${s2x}-ow/2\\,0\\,iw-ow)\\,clip(iw*${s1x}-ow/2\\,0\\,iw-ow)):if(lt(mod(t\\,10)\\,5)\\,clip(ih*${s2y}-oh/2\\,0\\,ih-oh)\\,clip(ih*${s1y}-oh/2\\,0\\,ih-oh)),scale=1080:1920:flags=lanczos,setsar=1[v]`;

    case 'speaker_left':
      return `${inputLabel}crop=${fullCw}:${fullCh}:clip(iw*${s1x}-ow/2\\,0\\,iw-ow):clip(ih*${s1y}-oh/2\\,0\\,ih-oh),scale=1080:1920:flags=lanczos,setsar=1[v]`;

    case 'speaker_right':
      return `${inputLabel}crop=${fullCw}:${fullCh}:clip(iw*${s2x}-ow/2\\,0\\,iw-ow):clip(ih*${s2y}-oh/2\\,0\\,ih-oh),scale=1080:1920:flags=lanczos,setsar=1[v]`;

    case 'speaker_center':
    case 'vertical_crop':
      return `${inputLabel}crop=${fullCw}:${fullCh}:(iw-ow)/2:clip(ih*0.30-oh/2\\,0\\,ih-oh),scale=1080:1920:flags=lanczos,setsar=1[v]`;

    case 'square':
      return `${inputLabel}crop=min(iw\\,ih):min(iw\\,ih),scale=1080:1080:flags=lanczos,setsar=1[v]`;

    case 'original':
      return `${inputLabel}scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v]`;

    case 'vertical_blur':
    default:
      return `${inputLabel}split=2[vb_bg][vb_fg];[vb_bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:5,drawbox=x=0:y=0:w=1080:h=1920:color=black@0.4:t=fill[bg];[vb_fg]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`;
  }
}

/**
 * Downloads a precise slice directly from a YouTube video in pristine 1080p Full HD
 */
export async function downloadYouTubeSlice({
  videoUrl,
  startTime,
  endTime,
}: {
  videoUrl: string;
  startTime: string;
  endTime: string;
}): Promise<string> {
  const safeYt = normalizeSafeYouTubeUrl(videoUrl);
  if (!safeYt) {
    throw new Error('URL do YouTube inválida ou bloqueada.');
  }

  const cleanStart = sanitizeTimestamp(startTime, '00:00');
  const cleanEnd = sanitizeTimestamp(endTime, '00:30');
  const intervalCheck = validateCutInterval(cleanStart, cleanEnd, 300);
  if (!intervalCheck.valid) {
    throw new Error(intervalCheck.error || 'Intervalo de tempo inválido.');
  }

  const randomSuffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const outBase = path.join(TEMP_DIR, `yt_raw_${randomSuffix}.mp4`);
  const ffmpegPath = getFfmpegPath();
  const ffmpegDir = path.dirname(ffmpegPath);
  const ytdlpBinary = getYtdlpPath();
  const nodePath = process.execPath;

  console.log(`[YouTube Downloader] Baixando trecho em alta definição 1080p (${cleanStart} -> ${cleanEnd}) de ${safeYt.canonicalUrl}`);

  // Create per-request isolated temporary cookie file if environment cookies exist
  let tempCookieFile: string | null = null;
  if (process.env.YOUTUBE_COOKIES) {
    try {
      tempCookieFile = path.join(TEMP_DIR, `cookie_${randomSuffix}.txt`);
      fs.writeFileSync(tempCookieFile, process.env.YOUTUBE_COOKIES, 'utf-8');
    } catch {}
  }

  const ytdlpArgs = [
    '--no-playlist',
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
    '--',
    safeYt.canonicalUrl,
    '-o',
    outBase,
  ];

  try {
    try {
      // Attempt 1: Direct binary execution
      await execFilePromise(ytdlpBinary, ytdlpArgs, { timeout: 150000 });
    } catch (directErr: any) {
      console.warn('[YouTube Downloader] Tentativa direta falhou, tentando via python3:', directErr?.message || directErr);
      // Attempt 2: Fallback to python3 execution
      await execFilePromise('python3', [ytdlpBinary, ...ytdlpArgs], { timeout: 150000 });
    }

    if (fs.existsSync(outBase) && fs.statSync(outBase).size > 1000) {
      return outBase;
    }

    const prefix = `yt_raw_${randomSuffix}`;
    const files = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(prefix));
    if (files.length > 0) {
      const fullPath = path.join(TEMP_DIR, files[0]);
      if (fs.statSync(fullPath).size > 1000) {
        return fullPath;
      }
    }

    throw new Error('O arquivo de vídeo não foi gerado pelo downloader do YouTube.');
  } catch (err: any) {
    const rawMsg = err?.message || String(err);
    const isBot =
      rawMsg.includes('Sign in to confirm you’re not a bot') ||
      rawMsg.includes('confirm you’re not a bot') ||
      rawMsg.includes('confirm you\'re not a bot') ||
      rawMsg.includes('bot');

    if (isBot) {
      throw new Error('Sign in to confirm you’re not a bot. O YouTube bloqueou o download automático neste IP.');
    }
    throw new Error(`Falha no download do YouTube: ${rawMsg.slice(0, 150)}`);
  } finally {
    if (tempCookieFile && fs.existsSync(tempCookieFile)) {
      try {
        fs.unlinkSync(tempCookieFile);
      } catch {}
    }
  }
}

/**
 * Downloads a YouTube video slice AND renders it to a vertical 9:16 Short with Cold-Open Climax Teaser + Clean 2-Word Subtitles
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
  teaserOffsetSec,
  teaserDurationSec,
  teaserText,
  partBadge,
  removeSilence = false,
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
  teaserOffsetSec?: number;
  teaserDurationSec?: number;
  teaserText?: string;
  partBadge?: string;
  removeSilence?: boolean;
}): Promise<string> {
  let rawSlicePath: string | null = null;
  try {
    rawSlicePath = await downloadYouTubeSlice({ videoUrl, startTime, endTime });

    const startSec = parseTimeToSeconds(startTime || '00:00');
    const endSec = parseTimeToSeconds(endTime || '00:30');
    const duration = Math.max(1, endSec - startSec);

    const renderedPath = await renderRealCutVideo({
      inputFilePath: rawSlicePath,
      startTime: '00:00',
      endTime: formatSecondsToMMSS(duration),
      format,
      subtitleTheme,
      overlayTitle,
      hook,
      framing,
      subtitles,
      teaserOffsetSec,
      teaserDurationSec,
      teaserText,
      partBadge,
      removeSilence,
    });

    return renderedPath;
  } finally {
    if (rawSlicePath && fs.existsSync(rawSlicePath)) {
      try {
        fs.unlinkSync(rawSlicePath);
      } catch {}
    }
  }
}

/**
 * Renders a video cut to vertical 9:16 Short format using FFmpeg with Option 3 Retention Architecture:
 * 1. Cold-Open Climax Teaser (places the 4s climax from inside the cut at 00:00-00:04 before the main story)
 * 2. Clean 2-word dynamic karaoke captions (Submagic / CapCut style) at the center line with zero giant boxes
 */
export async function renderRealCutVideo({
  inputFilePath,
  startTime,
  endTime,
  format = 'speaker_center',
  subtitleTheme = 'none',
  overlayTitle = '',
  hook = '',
  framing,
  subtitles,
  teaserOffsetSec,
  teaserDurationSec,
  teaserText,
  partBadge,
  removeSilence = false,
}: {
  inputFilePath: string;
  startTime: string;
  endTime: string;
  format?: string;
  subtitleTheme?: string;
  overlayTitle?: string;
  hook?: string;
  framing?: FramingOptions;
  subtitles?: string[];
  teaserOffsetSec?: number;
  teaserDurationSec?: number;
  teaserText?: string;
  partBadge?: string;
  removeSilence?: boolean;
}): Promise<string> {
  const startSec = parseTimeToSeconds(startTime || '00:00');
  const endSec = parseTimeToSeconds(endTime || '00:30');
  const duration = Math.max(1, endSec - startSec);

  const randomSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const outPath = path.join(TEMP_DIR, `cut_${randomSuffix}.mp4`);
  const fontPath = getSystemFont();
  const ffmpegCmd = getFfmpegPath();

  let fontArg = '';
  if (fontPath) {
    const escapedFont = fontPath.replace(/\\/g, '/').replace(':', '\\:');
    fontArg = `fontfile='${escapedFont}':`;
  }

  // Build clean 2-word subtitle chunks (no giant top rectangle!)
  const chunks =
    subtitles && subtitles.length > 0
      ? buildShortTwoWordChunks(subtitles.join(' '))
      : buildShortTwoWordChunks(teaserText || hook || overlayTitle);
  const subY = format === 'split_screen' ? 932 : 1360;

  // Build timed 2-word drawtext chain (Skipped when subtitleTheme === 'none' for 100% clean video)
  const buildCleanSubtitleDraws = (totalDur: number): string => {
    if (subtitleTheme === 'none') {
      return '';
    }
    const drawParts: string[] = [];
    let tCursor = 0.2;
    const step = 2.1;
    let idx = 0;
    while (tCursor < totalDur - 0.5 && idx < 28) {
      const phrase = sanitizeCleanCaptionText(chunks[idx % chunks.length], 18);
      if (phrase) {
        const tEnd = Math.min(totalDur, Number((tCursor + step - 0.1).toFixed(2)));
        const tStart = Number(tCursor.toFixed(2));
        let color = idx === 0 || idx % 3 === 0 ? '#fde047' : 'white';
        let styleParams = 'fontsize=52:borderw=4:bordercolor=black@0.95:shadowcolor=black@0.85:shadowx=2:shadowy=3';

        if (subtitleTheme === 'hormozi') {
          color = idx % 2 === 0 ? '#fde047' : '#a3e635';
          styleParams = 'fontsize=54:borderw=6:bordercolor=black:shadowcolor=black@0.9:shadowx=3:shadowy=4';
        } else if (subtitleTheme === 'beast') {
          color = idx % 2 === 0 ? '#22c55e' : '#38bdf8';
          styleParams = 'fontsize=52:borderw=5:bordercolor=black:shadowcolor=black@0.9:shadowx=3:shadowy=3';
        } else if (subtitleTheme === 'cyberpunk') {
          color = idx % 2 === 0 ? '#f43f5e' : '#06b6d4';
          styleParams = 'fontsize=52:borderw=4:bordercolor=#312e81:shadowcolor=black@0.9:shadowx=2:shadowy=3';
        } else if (subtitleTheme === 'submagic') {
          color = idx % 2 === 0 ? '#38bdf8' : '#fde047';
          styleParams = 'fontsize=50:box=1:boxcolor=black@0.75:boxborderw=8:borderw=3:bordercolor=black';
        } else if (subtitleTheme === 'minimalist') {
          color = 'white';
          styleParams = 'fontsize=46:borderw=2:bordercolor=black@0.7:shadowcolor=black@0.5:shadowx=1:shadowy=2';
        }

        drawParts.push(
          `drawtext=${fontArg}text='${phrase}':fontcolor=${color}:${styleParams}:x=(w-text_w)/2:y=${subY}:enable='between(t\\,${tStart}\\,${tEnd})'`
        );
      }
      tCursor += step;
      idx++;
    }
    return drawParts.join(',');
  };

  // Option 3: If cut is >= 18s, prepend the 4-second Cold-Open Climax Teaser from inside the cut itself!
  const useColdOpenTeaser = duration >= 18;
  if (useColdOpenTeaser) {
    const teaserDur = Number(teaserDurationSec || framing?.teaserDurationSec || 4);
    const relTeaserOffset = Number(
      teaserOffsetSec ??
        framing?.teaserOffsetSec ??
        Math.max(10, Math.min(duration - 5, Math.floor(duration * 0.62)))
    );
    const absTeaserStart = startSec + Math.max(8, Math.min(duration - teaserDur - 1, relTeaserOffset));
    const totalDurationWithTeaser = duration + teaserDur;
    const silenceFilter = removeSilence ? ',silenceremove=stop_periods=-1:stop_duration=0.35:stop_threshold=-32dB' : '';

    const layoutChain = buildLayoutFilter(format, framing, '[raw_v]');
    const subtitleChain = buildCleanSubtitleDraws(totalDurationWithTeaser);
    const filterComplex = `[0:v]setpts=PTS-STARTPTS[v0];[0:a]asetpts=PTS-STARTPTS,afade=t=out:st=${(teaserDur - 0.15).toFixed(2)}:d=0.15[a0];[1:v]setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.2[v1];[1:a]asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.15[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[raw_v][raw_a];[raw_a]highpass=f=80,loudnorm=I=-14:TP=-1.5:LRA=11${silenceFilter}[aout];${layoutChain}${subtitleChain ? `;[v]${subtitleChain}[vout]` : ''}`;
    const finalVLabel = subtitleChain ? '[vout]' : '[v]';

    try {
      const coldOpenArgs = [
        '-y',
        '-ss',
        String(absTeaserStart),
        '-t',
        String(teaserDur),
        '-i',
        inputFilePath,
        '-ss',
        String(startSec),
        '-t',
        String(duration),
        '-i',
        inputFilePath,
        '-filter_complex',
        filterComplex,
        '-map',
        finalVLabel,
        '-map',
        '[aout]',
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
        outPath,
      ];

      await execFilePromise(ffmpegCmd, coldOpenArgs, { timeout: 150000 });
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
        return outPath;
      }
    } catch (coldOpenErr) {
      console.warn('[FFmpeg] Fallback para renderização direta sem concat:', (coldOpenErr as any)?.message);
    }
  }

  // Standard clean render (or fallback for short/silent clips) — NO giant top box!
  let filterComplex = buildLayoutFilter(format, framing, '[0:v]');
  let outputMapLabel = '[v]';
  const subtitleChain = buildCleanSubtitleDraws(duration);
  if (subtitleChain) {
    filterComplex += `;[v]${subtitleChain}[vout]`;
    outputMapLabel = '[vout]';
  }

  const ffmpegArgs = [
    '-y',
    '-ss',
    String(startSec),
    '-t',
    String(duration),
    '-i',
    inputFilePath,
    '-filter_complex',
    filterComplex,
    '-map',
    outputMapLabel,
    '-map',
    '0:a?',
    '-af',
    `highpass=f=80,loudnorm=I=-14:TP=-1.5:LRA=11${removeSilence ? ',silenceremove=stop_periods=-1:stop_duration=0.35:stop_threshold=-32dB' : ''}`,
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
    outPath,
  ];

  await execFilePromise(ffmpegCmd, ffmpegArgs, { timeout: 150000 });

  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    throw new Error('O arquivo de vídeo renderizado não foi gerado pelo FFmpeg.');
  }

  return outPath;
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
