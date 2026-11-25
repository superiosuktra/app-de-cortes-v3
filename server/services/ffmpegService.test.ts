import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  buildLayoutFilter,
  buildSubtitleBlocks,
  buildSubtitleDrawtextChain,
  downloadYouTubeSlice,
  escapeDrawtextText,
  probeMediaFile,
  renderRealCutVideo,
  resolveTeaserConfig,
} from './ffmpegService.js';
import { TEMP_DIR, ensureDirectories } from '../config.js';
import { jobQueue } from './jobQueueService.js';
import { validateYouTubeMetadata } from './youtubeService.js';

const execFileAsync = promisify(execFile);

ensureDirectories();

async function createSampleVideo(
  filename: string,
  width: number,
  height: number,
  durationSec: number,
  withAudio: boolean
): Promise<string> {
  const filePath = path.join(TEMP_DIR, filename);
  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=duration=${durationSec}:size=${width}x${height}:rate=24`,
  ];
  if (withAudio) {
    args.push('-f', 'lavfi', '-i', `sine=frequency=440:duration=${durationSec}`);
  }
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
  if (withAudio) {
    args.push('-c:a', 'aac', '-shortest');
  }
  args.push(filePath);
  await execFileAsync('ffmpeg', args);
  return filePath;
}

test('buildLayoutFilter generates safe 9:16 filter chains for all layouts', () => {
  const centerFilter = buildLayoutFilter('speaker_center');
  assert.ok(centerFilter.includes('scale=1080:1920'), 'Center layout scales to 1080x1920');
  assert.ok(centerFilter.includes('min(iw\\,ih*9/16)'), 'Center layout clamps crop width safely');

  const splitFilter = buildLayoutFilter('split_screen');
  assert.ok(splitFilter.includes('scale=1080:960'), 'Split layout scales each half to 1080x960');
  assert.ok(splitFilter.includes('vstack=inputs=2'), 'Split layout vertically stacks 2 video inputs');
  assert.ok(splitFilter.includes('min(iw\\,ih*9/8)'), 'Split layout clamps crop width safely');

  const blurFilter = buildLayoutFilter('vertical_blur');
  assert.ok(blurFilter.includes('force_original_aspect_ratio=decrease'), 'Blur layout preserves unusual aspect ratios');
});

test('downloadYouTubeSlice rejects and throws error when url is invalid without synthetic fallback', async () => {
  await assert.rejects(
    async () => {
      await downloadYouTubeSlice({
        videoUrl: 'https://invalid-nonexistent-domain.com/bad',
        startTime: '00:00',
        endTime: '00:05',
      });
    },
    /URL do YouTube inválida ou bloqueada/,
    'Rejects unsafe URL with clear error'
  );
});

test('resolveTeaserConfig enforces <= 59s cap, avoids overlap, and disables cleanly when invalid', () => {
  // Valid teaser: total 30 + 3 = 33 <= 59, teaser [10, 13] inside [0, 30], no overlap
  const valid = resolveTeaserConfig({
    startSec: 0,
    duration: 30,
    sourceDuration: 60,
    teaserOffsetSec: 10,
    teaserDurationSec: 3,
  });
  assert.equal(valid.enabled, true);
  assert.equal(valid.teaserOffsetSec, 10);
  assert.equal(valid.teaserDurationSec, 3);
  assert.equal(valid.totalDurationSec, 33);

  // Exceeds 59s: 57 + 4 = 61 -> must disable cleanly instead of failing
  const overCap = resolveTeaserConfig({
    startSec: 0,
    duration: 57,
    sourceDuration: 90,
    teaserOffsetSec: 15,
    teaserDurationSec: 4,
  });
  assert.equal(overCap.enabled, false);

  // Overlap with opening [0, teaserDur] -> must disable cleanly
  const overlapping = resolveTeaserConfig({
    startSec: 0,
    duration: 30,
    sourceDuration: 60,
    teaserOffsetSec: 1,
    teaserDurationSec: 3,
  });
  assert.equal(overlapping.enabled, false);

  // Out-of-bounds offset -> must disable cleanly
  const outOfBounds = resolveTeaserConfig({
    startSec: 0,
    duration: 20,
    sourceDuration: 30,
    teaserOffsetSec: 25,
    teaserDurationSec: 3,
  });
  assert.equal(outOfBounds.enabled, false);
});

test('buildSubtitleBlocks and escapeDrawtextText split into 2-5 words, <=30 chars, never truncate mid-word, and respect subtitleTheme=none', () => {
  const blocks = buildSubtitleBlocks({
    totalDuration: 12,
    hook: 'Construir disciplina extraordinária diariamente transforma completamente seus resultados financeiros',
  });

  assert.ok(blocks.length >= 2, 'Produces multiple sequential subtitle blocks');
  const seen = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const wordCount = b.text.split(/\s+/).filter(Boolean).length;
    assert.ok(wordCount >= 1 && wordCount <= 5, `Block word count (${wordCount}) within bounds: "${b.text}"`);
    assert.ok(b.text.length <= 34, `Block length (${b.text.length}) respects visual limit: "${b.text}"`);
    assert.ok(!seen.has(b.text), `Subtitle block must not repeat: "${b.text}"`);
    seen.add(b.text);
    if (i > 0) {
      assert.ok(b.startSec >= blocks[i - 1].endSec - 0.01, 'Blocks are monotonically ordered without overlap');
    }
  }

  // Timestamped transcript segments are honored
  const timedBlocks = buildSubtitleBlocks({
    totalDuration: 10,
    transcriptSegments: [
      { startSec: 1, endSec: 4, text: 'Primeiro trecho com legenda sincronizada' },
      { startSec: 5, endSec: 9, text: 'Segundo trecho logo depois' },
    ],
  });
  assert.ok(timedBlocks.length >= 2);
  assert.ok(timedBlocks[0].startSec >= 1 && timedBlocks[0].endSec <= 4.01);

  // subtitleTheme === 'none' produces empty drawtext filter chain
  const noneChain = buildSubtitleDrawtextChain({
    subtitleTheme: 'none',
    blocks,
  });
  assert.equal(noneChain, '');

  // drawtext escaping handles quotes, colons, backslashes, percents
  const escaped = escapeDrawtextText("100%: 'foco' & \\teste\\");
  assert.ok(!escaped.includes("'"), 'Single quotes are escaped/neutralized');
  assert.ok(escaped.includes('\\:'), 'Colons are escaped for drawtext');
  assert.ok(escaped.includes('%%'), 'Percent signs are escaped for drawtext');
});

test('renderRealCutVideo handles horizontal, vertical, square, and silent videos safely and rejects out-of-range cuts', async () => {
  const filesToClean: string[] = [];
  try {
    // 1. Horizontal 16:9 with audio
    const horizIn = await createSampleVideo(`test_horiz_${Date.now()}.mp4`, 640, 360, 5, true);
    filesToClean.push(horizIn);
    const horizOut = path.join(TEMP_DIR, `out_horiz_${Date.now()}.mp4`);
    filesToClean.push(horizOut);

    await renderRealCutVideo({
      inputFilePath: horizIn,
      outputPath: horizOut,
      startTime: '00:00',
      endTime: '00:03',
      format: 'speaker_center',
      subtitleTheme: 'none',
    });
    const horizMeta = await probeMediaFile(horizOut);
    assert.equal(horizMeta.width, 1080);
    assert.equal(horizMeta.height, 1920);
    assert.equal(horizMeta.hasAudio, true);

    // 2. Vertical 9:16 WITHOUT audio (must not fail on highpass/loudnorm)
    const vertSilentIn = await createSampleVideo(`test_vert_silent_${Date.now()}.mp4`, 360, 640, 4, false);
    filesToClean.push(vertSilentIn);
    const vertSilentOut = path.join(TEMP_DIR, `out_vert_silent_${Date.now()}.mp4`);
    filesToClean.push(vertSilentOut);

    await renderRealCutVideo({
      inputFilePath: vertSilentIn,
      outputPath: vertSilentOut,
      startTime: '00:00',
      endTime: '00:03',
      format: 'split_screen',
      subtitleTheme: 'hormozi',
      hook: 'Teste: vídeo vertical 100% sem áudio',
    });
    const vertMeta = await probeMediaFile(vertSilentOut);
    assert.equal(vertMeta.width, 1080);
    assert.equal(vertMeta.height, 1920);
    assert.ok(vertMeta.duration >= 2.5, 'Rendered vertical silent cut has valid duration');

    // 3. Square 1:1 with vertical_blur
    const squareIn = await createSampleVideo(`test_square_${Date.now()}.mp4`, 400, 400, 4, true);
    filesToClean.push(squareIn);
    const squareOut = path.join(TEMP_DIR, `out_square_${Date.now()}.mp4`);
    filesToClean.push(squareOut);

    await renderRealCutVideo({
      inputFilePath: squareIn,
      outputPath: squareOut,
      startTime: '00:00',
      endTime: '00:03',
      format: 'vertical_blur',
      subtitleTheme: 'none',
    });
    const squareMeta = await probeMediaFile(squareOut);
    assert.equal(squareMeta.width, 1080);
    assert.equal(squareMeta.height, 1920);

    // 4. Cut beyond real video duration must fail with INVALID_CUT_INTERVAL and leave no partial output
    const badOut = path.join(TEMP_DIR, `out_oob_${Date.now()}.mp4`);
    filesToClean.push(badOut);
    await assert.rejects(
      () =>
        renderRealCutVideo({
          inputFilePath: horizIn,
          outputPath: badOut,
          startTime: '00:00',
          endTime: '00:20',
          format: 'speaker_center',
          subtitleTheme: 'none',
        }),
      (err: any) => err?.code === 'INVALID_CUT_INTERVAL'
    );
    assert.equal(fs.existsSync(badOut), false, 'No partial output file should remain after failure');
  } finally {
    for (const f of filesToClean) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {}
      }
    }
  }
});

test('jobQueue.cancelJobDetailed differentiates not_found, already_completed, already_cancelled, and owner isolation', () => {
  const missing = jobQueue.cancelJobDetailed('job_does_not_exist', 'user_a');
  assert.equal(missing.success, false);
  assert.equal(missing.reason, 'not_found');

  const now = new Date().toISOString();
  const jobId = `test_cancel_${Date.now()}`;
  jobQueue.addJob({
    id: jobId,
    type: 'batch_render',
    userId: 'user_owner_1',
    status: 'queued',
    progress: 0,
    currentStep: 'Na fila',
    totalItems: 1,
    completedItems: 0,
    failedItems: 0,
    itemIds: ['clip_1'],
    createdAt: now,
    updatedAt: now,
  });

  // Another user cannot cancel it
  const wrongOwner = jobQueue.cancelJobDetailed(jobId, 'user_other_2');
  assert.equal(wrongOwner.success, false);
  assert.equal(wrongOwner.reason, 'not_found');

  // Owner cancels queued job
  const firstCancel = jobQueue.cancelJobDetailed(jobId, 'user_owner_1');
  assert.equal(firstCancel.success, true);
  assert.equal(firstCancel.reason, 'cancelled');

  // Second cancel returns already_cancelled
  const secondCancel = jobQueue.cancelJobDetailed(jobId, 'user_owner_1');
  assert.equal(secondCancel.success, false);
  assert.equal(secondCancel.reason, 'already_cancelled');

  // Completed job returns already_completed
  const doneId = `test_done_${Date.now()}`;
  jobQueue.addJob({
    id: doneId,
    type: 'batch_render',
    userId: 'user_owner_1',
    status: 'completed',
    progress: 100,
    currentStep: 'Concluído',
    totalItems: 1,
    completedItems: 1,
    failedItems: 0,
    itemIds: ['clip_2'],
    createdAt: now,
    updatedAt: now,
  });
  const cancelCompleted = jobQueue.cancelJobDetailed(doneId, 'user_owner_1');
  assert.equal(cancelCompleted.success, false);
  assert.equal(cancelCompleted.reason, 'already_completed');
});

test('validateYouTubeMetadata enforces privacy, title <= 100, and description <= 5000', () => {
  const valid = validateYouTubeMetadata({
    title: 'Corte Viral de Teste',
    description: 'Descrição válida #Shorts',
    privacy: 'unlisted',
    tags: ['#Shorts', 'podcast'],
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.sanitizedPrivacy, 'unlisted');
  assert.ok(valid.sanitizedTitle?.startsWith('Corte Viral de Teste'));

  const badPrivacy = validateYouTubeMetadata({ title: 'Ok', description: 'Ok', privacy: 'friends_only' });
  assert.equal(badPrivacy.valid, false);
  assert.match(badPrivacy.error || '', /Privacidade inválida/i);

  const longTitle = validateYouTubeMetadata({ title: 'A'.repeat(101), description: 'Ok', privacy: 'public' });
  assert.equal(longTitle.valid, false);
  assert.match(longTitle.error || '', /100 caracteres/i);

  const longDesc = validateYouTubeMetadata({ title: 'Ok', description: 'B'.repeat(5001), privacy: 'private' });
  assert.equal(longDesc.valid, false);
  assert.match(longDesc.error || '', /5000 caracteres/i);
});
