import { test } from 'node:test';
import assert from 'node:assert';
import { buildLayoutFilter, downloadYouTubeSlice } from './ffmpegService.js';

test('buildLayoutFilter generates valid 9:16 filter chains', () => {
  const centerFilter = buildLayoutFilter('speaker_center');
  assert.ok(centerFilter.includes('scale=1080:1920'), 'Center layout scales to 1080x1920');

  const splitFilter = buildLayoutFilter('split_screen');
  assert.ok(splitFilter.includes('scale=1080:960'), 'Split layout scales each half to 1080x960');
  assert.ok(splitFilter.includes('vstack=inputs=2'), 'Split layout vertically stacks 2 video inputs');
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
