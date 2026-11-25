import path from 'path';
import fs from 'fs';
import { CLIPS_DIR } from '../config.js';
import {
  FramingOptions,
  MediaProbeResult,
  TranscriptSegmentInput,
  getFfprobePath,
  probeMediaFile,
  renderRealCutVideo,
} from './ffmpegService.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export type { MediaProbeResult };
export { getFfprobePath };

/**
 * Validates a video file using ffprobe.
 * Verifies existence, non-zero size, valid video stream, optional audio stream, dimensions, and duration.
 */
export async function validateMediaFile(filePath: string): Promise<MediaProbeResult> {
  return probeMediaFile(filePath);
}

export interface RenderClipParams {
  sourcePath: string;
  startTime: string; // MM:SS or HH:MM:SS or seconds
  endTime: string;
  outputPath?: string;
  clipId?: string;
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
  durationOverrideSec?: number;
  sourceStartOffsetSec?: number;
  originalCutStartSec?: number;
}

/**
 * Centralized, robust clip render function delegating to hardened FFmpeg pipeline.
 * Ensures ffprobe pre/post validation, safe crops, audio-aware rendering, validated teaser,
 * escaped non-repeating subtitles, and partial-file cleanup on failure.
 */
export async function renderClip(params: RenderClipParams): Promise<{
  outputPath: string;
  duration: number;
  fileSize: number;
  width: number;
  height: number;
  hasAudio: boolean;
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
    transcriptSegments,
    teaserOffsetSec,
    teaserDurationSec,
    teaserText,
    partBadge,
    removeSilence = false,
    durationOverrideSec,
    sourceStartOffsetSec = 0,
    originalCutStartSec,
  } = params;

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new AppError({
      code: 'INVALID_MEDIA',
      statusCode: 400,
      userMessage: 'Arquivo fonte de vídeo não encontrado para renderização.',
    });
  }

  const safeClipId = (clipId || `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`).replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const finalOutPath = params.outputPath || path.join(CLIPS_DIR, `${safeClipId}.mp4`);

  logger.info('[RenderService] Iniciando renderização do corte', {
    action: 'render_clip_start',
    clipId: safeClipId,
    startTime,
    endTime,
    format,
  });

  const renderedPath = await renderRealCutVideo({
    inputFilePath: sourcePath,
    startTime,
    endTime,
    outputPath: finalOutPath,
    durationOverrideSec,
    sourceStartOffsetSec,
    originalCutStartSec,
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

  const postProbe = await validateMediaFile(renderedPath);
  if (!postProbe.valid) {
    try {
      if (fs.existsSync(renderedPath)) fs.unlinkSync(renderedPath);
    } catch {}
    throw new AppError({
      code: 'FFMPEG_FAILED',
      statusCode: 500,
      userMessage: `O arquivo de vídeo renderizado falhou na validação de integridade: ${postProbe.error}`,
    });
  }

  logger.info('[RenderService] Corte renderizado com sucesso', {
    action: 'render_clip_success',
    clipId: safeClipId,
    duration: Number(postProbe.duration.toFixed(2)),
    fileSize: postProbe.fileSize,
    width: postProbe.width,
    height: postProbe.height,
    hasAudio: postProbe.hasAudio,
  });

  return {
    outputPath: renderedPath,
    duration: postProbe.duration,
    fileSize: postProbe.fileSize,
    width: postProbe.width,
    height: postProbe.height,
    hasAudio: postProbe.hasAudio,
  };
}
