import { test } from 'node:test';
import assert from 'node:assert';
import { verifyKwaiToken, postToKwai } from './socialService';

test('verifyKwaiToken validates bypass and demo tokens correctly', async () => {
  const result = await verifyKwaiToken('kwai-bypass-active', 'test_user');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.accountName, '@kwai_criador_pro');
  assert.ok(result.details.includes('Kwai Open Platform'));
});

test('postToKwai returns published metadata for valid cut', async () => {
  const result = await postToKwai({
    token: 'kwai-bypass-active',
    title: 'Corte Incrível no Kwai #Shorts',
    caption: 'Assista até o fim para ver a revelação!',
    videoUrl: 'https://storage.googleapis.com/test-bucket/video.mp4',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.platform, 'kwai');
  assert.ok(result.videoUrl.includes('kwai.com'));
  assert.ok(result.message.includes('Vídeo postado no Kwai'));
});
