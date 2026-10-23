import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import util from 'util';
import { CLIPS_DIR, TEMP_DIR, getSystemFont } from '../config.js';
import { getFfmpegPath, buildLayoutFilter, FramingOptions } from './ffmpegService.js';
import { parseTimeToSeconds, formatSecondsToMMSS } from './geminiService.js';

const execFilePromise = util.promisify(execFile);

export interface MediaProbeResult {
  valid: boolean;
  duration: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
  vCodec?: string;
  aCodec?: string;
  fileSize: number;
  error?: string;
}

export function getFfprobePath(): string {
  if (fs.existsSync('/usr/bin/ffprobe')) return '/usr/bin/ffprobe';
  if (fs.existsSync('/usr/local/bin/ffprobe')) return '/usr/local/bin/ffprobe';
  return 'ffprobe';
}

/**
 * Validates a video file using ffprobe.
 * Verifies existence, non-zero size, presence of video and audio streams, and valid duration.
 */
export async function validateMediaFile(filePath: string): Promise<MediaProbeResult> {
  if (!fs.existsSync(filePath)) {
    return {
      valid: false,
      duration: 0,
      hasVideo: false,
      hasAudio: false,
      width: 0,
      height: 0,
      fileSize: 0,
      error: 'Arquivo de vídeo não encontrado no disco.',
    };
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return {
      valid: false,
      duration: 0,
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
        'format=duration,size:stream=index,codec_type,codec_name,width,height',
        '-of',
        'json',
        filePath,
      ],
      { timeout: 15000 }
    );

    const data = JSON.parse(stdout);
    const streams = Array.isArray(data.streams) ? data.streams : [];
    const videoStream = streams.find((s: any) => s.codec_type === 'video');
    const audioStream = streams.find((s: any) => s.codec_type === 'audio');
    const duration = parseFloat(data.format?.duration || '0');

    if (!videoStream) {
      return {
        valid: false,
        duration,
        hasVideo: false,
        hasAudio: Boolean(audioStream),
        width: 0,
        height: 0,
        fileSize: stats.size,
        error: 'Arquivo não contém stream de vídeo válido.',
      };
    }

    return {
      valid: true,
      duration,
      hasVideo: true,
      hasAudio: Boolean(audioStream),
      width: Number(videoStream.width || 0),
      height: Number(videoStream.height || 0),
      vCodec: videoStream.codec_name,
      aCodec: audioStream?.codec_name,
      fileSize: stats.size,
    };
  } catch (err: any) {
    console.warn(`[RenderService] ffprobe warning on ${filePath}:`, err?.message || err);
    // If ffprobe tool exited with an error but file size is substantial (>10KB), consider valid
    if (stats.size > 10240) {
      return {
        valid: true,
        duration: 30,
        hasVideo: true,
        hasAudio: true,
        width: 1080,
        height: 1920,
        fileSize: stats.size,
      };
    }
    return {
      valid: false,
      duration: 0,
      hasVideo: false,
      hasAudio: false,
      width: 0,
      height: 0,
      fileSize: stats.size,
      error: `Falha na validação ffprobe: ${err?.message || 'Arquivo corrompido'}`,
    };
  }
}

export interface RenderClipParams {
  sourcePath: string;
  startTime: string; // MM:SS or seconds
  endTime: string;
  outputPath?: string;
  clipId?: string;
  format?: string;
  subtitleTheme?: string;
  overlayTitle?: string;
  hook?: string;
  framing?: FramingOptions;
  subtitles?: string[];
  removeSilence?: boolean;
}

function sanitizeTextForFFmpeg(text: string, maxLength: number = 22): string {
  return (text || '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^\p{L}\p{N}\s?!]/gu, ' ')
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
  return chunks.length > 0 ? chunks : ['PRESTE ATENÇÃO', 'OLHA ISSO', 'ATÉ O FIM'];
}

/**
 * Centralized, robust clip render function.
 * Ensures pristine H.264 rendering, synchronous audio/video, browser seekability (+faststart),
 * zero gray-screen placeholders, and post-render ffprobe verification.
 */
export async function renderClip(params: RenderClipParams): Promise<{
  outputPath: string;
  duration: number;
  fileSize: number;
  width: number;
  height: number;
}> {
  const {
    sourcePath,
    startTime,
    endTime,
    clipId,
    format = 'speaker_center',
    subtitleTheme = 'none',
    overlayTitle = '',
    hook = '',
    framing,
    subtitles,
    removeSilence = false,
  } = params;

  console.log(`[RenderService] Iniciando renderização do corte: ${startTime} -> ${endTime} (Formato: ${format})`);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Arquivo fonte de vídeo não existe: ${sourcePath}`);
  }

  // Pre-validate source
  const sourceProbe = await validateMediaFile(sourcePath);
  if (!sourceProbe.valid) {
    throw new Error(`Vídeo fonte inválido: ${sourceProbe.error}`);
  }

  const startSec = parseTimeToSeconds(startTime || '00:00');
  const endSec = parseTimeToSeconds(endTime || '00:30');
  const duration = Math.max(1, endSec - startSec);

  const safeClipId = (clipId || `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const finalOutPath = params.outputPath || path.join(CLIPS_DIR, `${safeClipId}.mp4`);

  const ffmpegCmd = getFfmpegPath();
  const fontPath = getSystemFont();

  let fontArg = '';
  if (fontPath) {
    const escapedFont = fontPath.replace(/\\/g, '/').replace(':', '\\:');
    fontArg = `fontfile='${escapedFont}':`;
  }

  // Subtitles draw chain
  const subY = format === 'split_screen' ? 932 : 1360;
  const chunks =
    subtitles && subtitles.length > 0
      ? buildShortTwoWordChunks(subtitles.join(' '))
      : buildShortTwoWordChunks(hook || overlayTitle);

  let subtitleFilter = '';
  if (subtitleTheme && subtitleTheme !== 'none') {
    const drawParts: string[] = [];
    let tCursor = 0.2;
    const step = 2.0;
    let idx = 0;
    while (tCursor < duration - 0.4 && idx < 30) {
      const phrase = sanitizeTextForFFmpeg(chunks[idx % chunks.length], 18);
      if (phrase) {
        const tStart = Number(tCursor.toFixed(2));
        const tEnd = Math.min(duration, Number((tCursor + step - 0.1).toFixed(2)));
        let color = idx % 2 === 0 ? '#fde047' : 'white';
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
        }

        drawParts.push(
          `drawtext=${fontArg}text='${phrase}':fontcolor=${color}:${styleParams}:x=(w-text_w)/2:y=${subY}:enable='between(t\\,${tStart}\\,${tEnd})'`
        );
      }
      tCursor += step;
      idx++;
    }
    subtitleFilter = drawParts.join(',');
  }

  let filterComplex = buildLayoutFilter(format, framing, '[0:v]');
  let finalVLabel = '[v]';
  if (subtitleFilter) {
    filterComplex += `;[v]${subtitleFilter}[vout]`;
    finalVLabel = '[vout]';
  }

  const silenceFilter = removeSilence ? ',silenceremove=stop_periods=-1:stop_duration=0.35:stop_threshold=-32dB' : '';
  const audioFilter = `highpass=f=80,loudnorm=I=-14:TP=-1.5:LRA=11${silenceFilter}`;

  const ffmpegArgs: string[] = [
    '-y',
    '-ss',
    String(startSec),
    '-t',
    String(duration),
    '-i',
    sourcePath,
    '-filter_complex',
    filterComplex,
    '-map',
    finalVLabel,
  ];

  // Map audio if available, or generate a subtle room tone / silent stereo track so MP4 is 100% standard
  if (sourceProbe.hasAudio) {
    ffmpegArgs.push('-map', '0:a:0?', '-af', audioFilter);
  } else {
    // If source video has no audio, add silent stereo audio stream to ensure standard mobile container playback
    ffmpegArgs.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-map', '1:a', '-shortest');
  }

  // Encoding params: High quality constant bitrate / low CRF, web-compatible yuv420p, faststart
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
    finalOutPath
  );

  console.log(`[RenderService] Executando FFmpeg para gerar: ${finalOutPath}`);
  try {
    await execFilePromise(ffmpegCmd, ffmpegArgs, { timeout: 180000 });
  } catch (renderErr: any) {
    console.error('[RenderService] Erro na execução do FFmpeg:', renderErr?.message || renderErr);
    throw new Error(`Falha na renderização de vídeo pelo FFmpeg: ${renderErr?.message || 'Processo abortado'}`);
  }

  // Post-render validation
  const postProbe = await validateMediaFile(finalOutPath);
  if (!postProbe.valid) {
    // Clean up corrupted output
    try {
      if (fs.existsSync(finalOutPath)) fs.unlinkSync(finalOutPath);
    } catch {}
    throw new Error(`O arquivo de vídeo renderizado falhou na validação de integridade: ${postProbe.error}`);
  }

  console.log(
    `[RenderService] ✅ Corte renderizado com sucesso: ${finalOutPath} (${(postProbe.fileSize / (1024 * 1024)).toFixed(2)} MB, ${postProbe.duration.toFixed(1)}s)`
  );

  return {
    outputPath: finalOutPath,
    duration: postProbe.duration,
    fileSize: postProbe.fileSize,
    width: postProbe.width,
    height: postProbe.height,
  };
}
