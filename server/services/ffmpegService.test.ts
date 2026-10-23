import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { downloadYouTubeSlice, buildLayoutFilter } from './ffmpegService';

test('buildLayoutFilter generates valid 9:16 filter chains', () => {
  const centerFilter = buildLayoutFilter('speaker_center');
  assert.ok(centerFilter.includes('scale=1080:1920'), 'Center layout scales to 1080x1920');

  const splitFilter = buildLayoutFilter('split_screen');
  assert.ok(splitFilter.includes('scale=1080:960'), 'Split layout scales each half to 1080x960');
  assert.ok(splitFilter.includes('vstack=inputs=2'), 'Split layout vertically stacks 2 video inputs');
});

test('downloadYouTubeSlice fallback generates valid mp4 file when url is unreachable', async () => {
  const slicePath = await downloadYouTubeSlice({
    videoUrl: 'https://www.youtube.com/watch?v=nonexistent_invalid_id_99999',
    startTime: '00:00',
    endTime: '00:05',
  });

  assert.ok(fs.existsSync(slicePath), 'Fallback video file exists');
  const stats = fs.statSync(slicePath);
  assert.ok(stats.size > 1000, 'Fallback video has valid content size (>1KB)');

  // Clean up
  try {
    fs.unlinkSync(slicePath);
  } catch {}
});
