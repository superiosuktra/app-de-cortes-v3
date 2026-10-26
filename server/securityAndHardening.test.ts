import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { TEMP_DIR, UPLOADS_DIR } from './config.js';
import {
  parseCookies,
  parseHttpRange,
  assertSafeOutboundUrl,
  registerUploadedFile,
  sanitizeTimestamp,
  validateCutInterval,
  parseTimeToSeconds,
  formatSecondsToMMSS,
} from './middleware/security.js';
import {
  computeClipParamsHash,
  saveClipForUser,
  getClipForUser,
  validateBatchCutsArray,
  enqueueBatchRenderJob,
  processBatchQueue,
  cancelJob,
  cleanExpiredJobsAndFiles,
  jobQueue,
  clipMetadata,
} from './services/jobQueueService.js';
import { stateManager } from './services/stateService.js';
import { maskCredentialsForClient } from './routes/stateRoutes.js';
import {
  isYtDlpBotChallenge,
  resolveUserYouTubeCookies,
  downloadYouTubeSlice,
} from './services/ffmpegService.js';
import db, { hashSessionToken } from './db.js';
import { createApp } from '../server.js';

async function withTestServer(fn: (baseUrl: string) => Promise<void>) {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function createAuthSession(userId: string, email: string): string {
  db.data.users[userId] = {
    id: userId,
    email,
    name: `User ${userId}`,
    created_at: new Date().toISOString(),
  };
  const rawToken = `tok_${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  db.createSession(userId, rawToken, Date.now() + 3600_000);
  return rawToken;
}

// ============================================================================
// P0 ITEM 1: parseCookies, Range validation (416 + suffix range), asyncHandler
// ============================================================================

test('P0.1 - parseCookies handles malformed percent-encoding without throwing URIError', () => {
  const malformedHeader = 'bad_cookie=%E0%A4%A; session_token=valid_token_123; encoded=hello%20world';
  const parsed = parseCookies(malformedHeader);
  assert.equal(parsed.bad_cookie, '%E0%A4%A');
  assert.equal(parsed.session_token, 'valid_token_123');
  assert.equal(parsed.encoded, 'hello world');
});

test('P0.1 - parseHttpRange validates standard ranges, supports suffix-range, and rejects invalid ranges', () => {
  const fileSize = 2000;

  // Standard range
  const r1 = parseHttpRange('bytes=0-499', fileSize);
  assert.equal(r1.valid, true);
  if (r1.valid) {
    assert.equal(r1.start, 0);
    assert.equal(r1.end, 499);
    assert.equal(r1.chunkSize, 500);
  }

  // Open-ended range
  const r2 = parseHttpRange('bytes=1500-', fileSize);
  assert.equal(r2.valid, true);
  if (r2.valid) {
    assert.equal(r2.start, 1500);
    assert.equal(r2.end, 1999);
    assert.equal(r2.chunkSize, 500);
  }

  // Suffix range: bytes=-500 -> last 500 bytes (1500..1999)
  const suffix = parseHttpRange('bytes=-500', fileSize);
  assert.equal(suffix.valid, true);
  if (suffix.valid) {
    assert.equal(suffix.start, 1500);
    assert.equal(suffix.end, 1999);
    assert.equal(suffix.chunkSize, 500);
  }

  // Invalid ranges -> must return { valid: false }
  assert.equal(parseHttpRange('bytes=-0', fileSize).valid, false);
  assert.equal(parseHttpRange('bytes=500-100', fileSize).valid, false);
  assert.equal(parseHttpRange('bytes=0-2000', fileSize).valid, false);
  assert.equal(parseHttpRange('bytes=2000-2500', fileSize).valid, false);
  assert.equal(parseHttpRange('bytes=abc-def', fileSize).valid, false);
  assert.equal(parseHttpRange('bytes=0-100, 200-300', fileSize).valid, false);
});

test('P0.1 & P0.2 - /api/clips/:clipId/preview supports suffix Range (206), returns 416 on invalid Range, and enforces userId ownership (404)', async () => {
  const userAToken = createAuthSession('user_range_a', 'a@test.local');
  const userBToken = createAuthSession('user_range_b', 'b@test.local');

  const dummyClipPath = path.join(TEMP_DIR, `test_clip_${Date.now()}.mp4`);
  fs.writeFileSync(dummyClipPath, Buffer.alloc(1000, 0x42));

  saveClipForUser('clip_test_1', 'user_range_a', dummyClipPath, 'clip_test_1.mp4', {
    startTime: '00:00',
    endTime: '00:10',
  });

  try {
    await withTestServer(async (baseUrl) => {
      // 1. Malformed cookie on public route does not crash server
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: 'session_token=%E0%A4%A' },
      });
      assert.equal(meRes.status, 200);

      // 2. Owner requests suffix range bytes=-200 -> 206 Partial Content
      const suffixRes = await fetch(`${baseUrl}/api/clips/clip_test_1/preview`, {
        headers: {
          Authorization: `Bearer ${userAToken}`,
          Range: 'bytes=-200',
        },
      });
      assert.equal(suffixRes.status, 206);
      assert.equal(suffixRes.headers.get('content-range'), 'bytes 800-999/1000');
      const buf = await suffixRes.arrayBuffer();
      assert.equal(buf.byteLength, 200);

      // 3. Owner requests out-of-bounds range bytes=500-2000 -> 416 Range Not Satisfiable
      const invalidRangeRes = await fetch(`${baseUrl}/api/clips/clip_test_1/preview`, {
        headers: {
          Authorization: `Bearer ${userAToken}`,
          Range: 'bytes=500-2000',
        },
      });
      assert.equal(invalidRangeRes.status, 416);
      assert.equal(invalidRangeRes.headers.get('content-range'), 'bytes */1000');

      // 4. Another user (userB) requests userA's clip preview & download -> 404
      const otherPreview = await fetch(`${baseUrl}/api/clips/clip_test_1/preview`, {
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      assert.equal(otherPreview.status, 404);

      const otherDownload = await fetch(`${baseUrl}/api/clips/clip_test_1/download`, {
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      assert.equal(otherDownload.status, 404);
    });
  } finally {
    if (fs.existsSync(dummyClipPath)) fs.unlinkSync(dummyClipPath);
  }
});

// ============================================================================
// P0 ITEM 2 & P0 ITEM 3: Batch job ownership, exact ZIP lookup, sourceFilePath validation
// ============================================================================

test('P0.2 & P0.3 - /api/batch/* enforces userId ownership, exact zipPath lookup, and sourceFilePath inside UPLOADS_DIR owned by user', async () => {
  const userAToken = createAuthSession('user_batch_a', 'batcha@test.local');
  const userBToken = createAuthSession('user_batch_b', 'batchb@test.local');

  const dummyClip = path.join(TEMP_DIR, `batch_item_${Date.now()}.mp4`);
  fs.writeFileSync(dummyClip, Buffer.from('fake-mp4-content-1234567890'));

  const job = enqueueBatchRenderJob({
    userId: 'user_batch_a',
    videoUrl: 'https://www.youtube.com/watch?v=2ZIpFytCSVc',
    cuts: [
      {
        id: 'cut_b1',
        title: 'Corte Lote 1',
        startTime: '00:10',
        endTime: '00:25',
      },
    ],
    customRunner: async () => dummyClip,
  });

  await processBatchQueue();
  assert.equal(job.status, 'completed');
  assert.ok(job.zipPath && fs.existsSync(job.zipPath));

  const validUploadPath = path.join(UPLOADS_DIR, `owned_${Date.now()}.mp4`);
  fs.writeFileSync(validUploadPath, Buffer.from('upload-video'));
  registerUploadedFile(validUploadPath, 'user_batch_a');

  try {
    await withTestServer(async (baseUrl) => {
      // 1. User B cannot view, cancel, or download User A's batch job (returns 404)
      const statusB = await fetch(`${baseUrl}/api/batch/${job.id}`, {
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      assert.equal(statusB.status, 404);

      const downloadB = await fetch(`${baseUrl}/api/batch/${job.id}/download`, {
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      assert.equal(downloadB.status, 404);

      // 2. Substring attack like /api/batch/zip/download returns 404 (never scans TEMP_DIR with f.includes)
      const zipAttack = await fetch(`${baseUrl}/api/batch/zip/download`, {
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      assert.equal(zipAttack.status, 404);

      // 3. User A can download their own batch ZIP
      const downloadA = await fetch(`${baseUrl}/api/batch/${job.id}/download`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      assert.equal(downloadA.status, 200);
      const zipBytes = Buffer.from(await downloadA.arrayBuffer());
      assert.equal(zipBytes.readUInt32LE(0), 0x04034b50); // Valid PKZIP header

      // 4. P0.3: /api/batch/render rejects sourceFilePath outside UPLOADS_DIR (403)
      const traversalRes = await fetch(`${baseUrl}/api/batch/render`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceFilePath: '/etc/passwd',
          cuts: [{ id: 'c1', title: 'Teste', startTime: '00:00', endTime: '00:15' }],
        }),
      });
      assert.equal(traversalRes.status, 403);

      // 5. P0.3: /api/batch/render rejects sourceFilePath inside UPLOADS_DIR owned by another user (404)
      const unownedRes = await fetch(`${baseUrl}/api/batch/render`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userBToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceFilePath: validUploadPath,
          cuts: [{ id: 'c1', title: 'Teste', startTime: '00:00', endTime: '00:15' }],
        }),
      });
      assert.equal(unownedRes.status, 404);
    });
  } finally {
    if (fs.existsSync(dummyClip)) fs.unlinkSync(dummyClip);
    if (job.zipPath && fs.existsSync(job.zipPath)) fs.unlinkSync(job.zipPath);
    if (fs.existsSync(validUploadPath)) fs.unlinkSync(validUploadPath);
  }
});

// ============================================================================
// P1 ITEM 4: Render cache hash invalidation when clip parameters change
// ============================================================================

test('P1.4 - computeClipParamsHash changes whenever title, format, framing, subtitles, startTime, or endTime change', () => {
  const baseParams = {
    videoUrl: 'https://www.youtube.com/watch?v=2ZIpFytCSVc',
    startTime: '00:10',
    endTime: '00:40',
    format: 'speaker_center',
    subtitleTheme: 'none',
    title: 'Título Original',
    hook: 'Gancho 1',
    framing: { speaker1X: 50, speaker1Y: 30, speaker2X: 50, speaker2Y: 30, zoom: 1.0 },
    subtitles: ['FRASE UM', 'FRASE DOIS'],
  };

  const baseHash = computeClipParamsHash(baseParams);
  assert.equal(computeClipParamsHash({ ...baseParams }), baseHash);

  assert.notEqual(computeClipParamsHash({ ...baseParams, title: 'Novo Título' }), baseHash);
  assert.notEqual(computeClipParamsHash({ ...baseParams, format: 'split_screen' }), baseHash);
  assert.notEqual(computeClipParamsHash({ ...baseParams, startTime: '00:12' }), baseHash);
  assert.notEqual(computeClipParamsHash({ ...baseParams, endTime: '00:45' }), baseHash);
  assert.notEqual(computeClipParamsHash({ ...baseParams, subtitles: ['OUTRA LEGENDA'] }), baseHash);
  assert.notEqual(
    computeClipParamsHash({
      ...baseParams,
      framing: { ...baseParams.framing, speaker1X: 25 },
    }),
    baseHash
  );
});

// ============================================================================
// P1 ITEM 5: Batch cuts validation (max 20 items, required string fields, valid intervals)
// ============================================================================

test('P1.5 - validateBatchCutsArray enforces max 20 cuts, string fields, and valid intervals per cut', () => {
  // Empty array
  assert.equal(validateBatchCutsArray([]).valid, false);

  // Exceeds 20 cuts
  const tooMany = Array.from({ length: 21 }, (_, i) => ({
    id: `cut_${i}`,
    title: `Corte ${i}`,
    startTime: '00:00',
    endTime: '00:30',
  }));
  const resTooMany = validateBatchCutsArray(tooMany);
  assert.equal(resTooMany.valid, false);
  assert.ok(resTooMany.error?.includes('20'));

  // Missing title or non-string fields
  assert.equal(
    validateBatchCutsArray([{ id: 'c1', startTime: '00:00', endTime: '00:30' }]).valid,
    false
  );

  // Invalid cut interval (endTime <= startTime)
  assert.equal(
    validateBatchCutsArray([{ id: 'c1', title: 'T', startTime: '01:00', endTime: '00:30' }]).valid,
    false
  );

  // Valid cuts across distant timestamps (e.g., 05:00-05:45 and 45:00-45:45) succeed
  const distantCuts = validateBatchCutsArray([
    { id: 'c1', title: 'Parte 1', startTime: '05:00', endTime: '05:45' },
    { id: 'c2', title: 'Parte 2', startTime: '45:00', endTime: '45:45' },
  ]);
  assert.equal(distantCuts.valid, true);
  assert.equal(distantCuts.sanitizedCuts?.length, 2);
});

// ============================================================================
// P1 ITEM 6: SSRF protection via assertSafeOutboundUrl
// ============================================================================

test('P1.6 - assertSafeOutboundUrl blocks IPv6 loopback [::1], 0.0.0.0, IPv4-mapped IPv6, private IPs, metadata, and DNS rebinding', async () => {
  const blockedUrls = [
    'http://[::1]:11434/api/tags',
    'http://0.0.0.0:11434/api/tags',
    'http://127.0.0.1:11434/api/tags',
    'http://localhost:11434/api/tags',
    'http://[::ffff:127.0.0.1]:11434/api/tags',
    'http://[::ffff:7f00:1]:11434/api/tags',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1:8080/',
    'http://172.16.0.5:8080/',
    'http://192.168.1.10:8080/',
    'http://[fc00::1]:8080/',
    'http://[fd00::1]:8080/',
    'http://[fe80::1]:8080/',
    'ftp://93.184.216.34/file',
  ];

  for (const url of blockedUrls) {
    await assert.rejects(
      () => assertSafeOutboundUrl(url),
      /bloqueado|permitidos|inválido/i,
      `Expected ${url} to be blocked by assertSafeOutboundUrl`
    );
  }

  // Hostname resolving to 127.0.0.1 (like x.nip.io) must be blocked after DNS lookup
  await assert.rejects(
    () =>
      assertSafeOutboundUrl('http://127.0.0.1.nip.io:11434/api/tags', {
        lookupFn: async () => [{ address: '127.0.0.1', family: 4 }],
      }),
    /SSRF bloqueado/i
  );

  // Hostname resolving to public IP is allowed
  const safeParsed = await assertSafeOutboundUrl('https://example.com/api/tags', {
    lookupFn: async () => [{ address: '93.184.216.34', family: 4 }],
  });
  assert.equal(safeParsed.hostname, 'example.com');
});

// ============================================================================
// P1 ITEM 7: validateCutInterval enforced in socialRoutes (/post-social & /post-youtube)
// ============================================================================

test('P1.7 - /api/post-social and /api/post-youtube return 400 when validateCutInterval fails', async () => {
  const token = createAuthSession('user_social_val', 'social@test.local');

  await withTestServer(async (baseUrl) => {
    const res1 = await fetch(`${baseUrl}/api/post-social`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform: 'youtube',
        token: 'demo_youtube_token',
        startTime: '02:00',
        endTime: '01:00', // invalid: end < start
      }),
    });
    assert.equal(res1.status, 400);
    const data1 = await res1.json();
    assert.ok(data1.error);

    const res2 = await fetch(`${baseUrl}/api/post-youtube`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accessToken: 'demo_youtube_token',
        startTime: '00:00',
        endTime: '10:00', // invalid: 600s > 300s max
      }),
    });
    assert.equal(res2.status, 400);
    const data2 = await res2.json();
    assert.ok(data2.error?.includes('300s'));
  });
});

// ============================================================================
// P1 ITEM 8: Unmasked clientId + masked values ignored + allowlist in updateCredentials
// ============================================================================

test('P1.8 - maskCredentialsForClient keeps clientId unmasked and updateCredentials ignores masked values and strips non-allowlisted flags', () => {
  const userId = 'user_creds_test';
  stateManager.updateCredentials(
    {
      youtube: {
        clientId: '123456-real-client-id.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-real-secret-value',
        accessToken: 'ya29.real_access_token_value',
        refreshToken: '1//04real_refresh_token_value',
        cookies: '# Netscape HTTP Cookie File\n.youtube.com\tTRUE',
        status: 'connected',
      },
    },
    userId
  );

  const saved = stateManager.getCredentials(userId);
  const maskedForUi = maskCredentialsForClient(saved);

  // clientId must NOT be masked
  assert.equal(maskedForUi.youtube.clientId, '123456-real-client-id.apps.googleusercontent.com');
  // Secrets must be masked
  assert.equal(maskedForUi.youtube.clientSecret, '••••••••');
  assert.equal(maskedForUi.youtube.accessToken, '••••••••');
  assert.equal(maskedForUi.youtube.refreshToken, '••••••••');

  // Now simulate client sending back the masked payload + extra flags (hasRefreshToken, hasCookies, configured, hasOpenAiKey)
  stateManager.updateCredentials(
    {
      youtube: {
        ...maskedForUi.youtube,
        hasRefreshToken: true,
        hasCookies: true,
        configured: true,
      } as any,
      aiConfig: {
        provider: 'gemini',
        ollamaEndpoint: 'http://localhost:11434',
        ollamaModel: 'llama3:8b',
        openAiKey: '••••••••',
        hasOpenAiKey: true,
      } as any,
    },
    userId
  );

  const afterRoundtrip = stateManager.getCredentials(userId);
  assert.equal(afterRoundtrip.youtube.clientId, '123456-real-client-id.apps.googleusercontent.com');
  assert.equal(afterRoundtrip.youtube.clientSecret, 'GOCSPX-real-secret-value');
  assert.equal(afterRoundtrip.youtube.accessToken, 'ya29.real_access_token_value');
  assert.equal(afterRoundtrip.youtube.refreshToken, '1//04real_refresh_token_value');
  assert.equal(afterRoundtrip.youtube.cookies, '# Netscape HTTP Cookie File\n.youtube.com\tTRUE');
  assert.equal((afterRoundtrip.youtube as any).hasRefreshToken, undefined);
  assert.equal((afterRoundtrip.youtube as any).hasCookies, undefined);
  assert.equal((afterRoundtrip.youtube as any).configured, undefined);
  assert.equal((afterRoundtrip.aiConfig as any).hasOpenAiKey, undefined);
});

// ============================================================================
// P1 ITEM 9, 10, 11: User cookies in yt-dlp, timestamp validation before sanitizeTimestamp, exact bot phrase check
// ============================================================================

test('P1.9 - resolveUserYouTubeCookies returns decrypted user cookies and downloadYouTubeSlice cleans up 0600 temp cookie file', async () => {
  const userId = 'user_cookies_yt';
  const sampleCookies = '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc123xyz';
  stateManager.updateCredentials(
    {
      youtube: {
        accessToken: '',
        cookies: sampleCookies,
        status: 'connected',
      },
    },
    userId
  );

  assert.equal(resolveUserYouTubeCookies(userId), sampleCookies);

  // Trigger downloadYouTubeSlice with unreachable video (will create 0600 cookie file and clean it up in finally)
  const slicePath = await downloadYouTubeSlice({
    videoUrl: 'https://www.youtube.com/watch?v=invalid_999',
    startTime: '00:00',
    endTime: '00:03',
    userId,
  });

  try {
    assert.ok(fs.existsSync(slicePath));
    const leftoverCookies = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith('cookies_'));
    assert.equal(leftoverCookies.length, 0, 'Temporary cookie file must be deleted in finally');
  } finally {
    if (fs.existsSync(slicePath)) fs.unlinkSync(slicePath);
  }
});

test('P1.10 - downloadYouTubeSlice and sanitizeTimestamp reject invalid timestamps instead of silently falling back to 00:00', async () => {
  assert.throws(() => sanitizeTimestamp('invalid_time'), /inválido/i);
  assert.throws(() => sanitizeTimestamp('12:99'), /inválido/i);
  assert.throws(() => formatSecondsToMMSS(NaN), /inválido/i);
  assert.equal(Number.isNaN(parseTimeToSeconds('not-a-time')), true);

  await assert.rejects(
    () =>
      downloadYouTubeSlice({
        videoUrl: 'https://www.youtube.com/watch?v=2ZIpFytCSVc',
        startTime: 'invalid_timestamp',
        endTime: '00:30',
      }),
    /inválido/i
  );

  await assert.rejects(
    () =>
      downloadYouTubeSlice({
        videoUrl: 'https://www.youtube.com/watch?v=2ZIpFytCSVc',
        startTime: '01:00',
        endTime: '00:30',
      }),
    /tempo final deve ser maior/i
  );
});

test('P1.11 - isYtDlpBotChallenge matches only exact yt-dlp bot phrases and ignores "both" or "robots.txt"', () => {
  assert.equal(isYtDlpBotChallenge('ERROR: Sign in to confirm you\'re not a bot'), true);
  assert.equal(isYtDlpBotChallenge('ERROR: [youtube] Sign in to confirm you’re not a bot.'), true);
  assert.equal(isYtDlpBotChallenge('Failed to download both video and audio streams'), false);
  assert.equal(isYtDlpBotChallenge('HTTP Error 404: robots.txt not found at bottom of page'), false);
});

// ============================================================================
// P1 ITEM 12 & P2 ITEM 17: OAuth email_verified check, PKCE + state, SHA-256 session token hash
// ============================================================================

test('P1.12 & P2.17 - OAuth callback rejects unverified email (403) and sessions store SHA-256 hash in database.json', async () => {
  const rawToken = 'raw_secret_session_token_test_999';
  const expectedHash = hashSessionToken(rawToken);
  db.createSession('default', rawToken, Date.now() + 60_000);

  // Raw token is NOT a key in db.data.sessions; only the SHA-256 hash is stored
  assert.equal(db.data.sessions[rawToken], undefined);
  assert.ok(db.data.sessions[expectedHash]);
  assert.equal(db.getSessionByRawToken(rawToken)?.user_id, 'default');

  // Test OAuth callback rejecting unverified email
  stateManager.updateCredentials(
    {
      youtube: {
        accessToken: '',
        clientId: 'test-client-id.apps.googleusercontent.com',
        clientSecret: 'test-client-secret',
        status: 'disconnected',
      },
    },
    'default'
  );

  const originalFetch = globalThis.fetch;
  try {
    await withTestServer(async (baseUrl) => {
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr === 'https://oauth2.googleapis.com/token') {
          return new Response(JSON.stringify({ access_token: 'ya29.test_oauth_token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') {
          return new Response(
            JSON.stringify({
              id: 'google_123',
              email: 'victim@example.com',
              email_verified: false,
              verified_email: false,
              name: 'Unverified User',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input, init);
      };

      const callbackRes = await originalFetch(
        `${baseUrl}/api/auth/google/callback?code=4/testcode&state=csrf_state_123`,
        {
          headers: {
            Cookie: 'oauth_state=csrf_state_123; oauth_code_verifier=verifier_123',
          },
        }
      );
      assert.equal(callbackRes.status, 403);
      const html = await callbackRes.text();
      assert.ok(html.includes('E-mail não verificado'));
    });
  } finally {
    globalThis.fetch = originalFetch;
    db.deleteSessionByRawToken(rawToken);
  }
});

// ============================================================================
// P1 ITEM 13: Job queue resilience (missing title), cancelJob guard on completed, 1h expiration
// ============================================================================

test('P1.13 - jobQueue handles cut without title without wedging queue, prevents cancelling completed job, and expires jobs > 1h', async () => {
  const dummyOut = path.join(TEMP_DIR, `resilient_cut_${Date.now()}.mp4`);
  fs.writeFileSync(dummyOut, Buffer.from('mp4-data-content'));

  try {
    // 1. Enqueue a job with a cut missing title (undefined title) followed by a valid cut
    const job = enqueueBatchRenderJob({
      userId: 'user_queue_13',
      videoUrl: 'https://www.youtube.com/watch?v=2ZIpFytCSVc',
      cuts: [
        { id: 'c_no_title', title: undefined as any, startTime: '00:00', endTime: '00:15' },
        { id: 'c_valid', title: 'Corte Válido', startTime: '00:15', endTime: '00:30' },
      ],
      customRunner: async () => dummyOut,
    });

    await processBatchQueue();
    assert.equal(job.status, 'completed');
    assert.equal(job.completedCuts, 2);

    // 2. cancelJob must NOT overwrite an already completed job
    const cancelAttempt = cancelJob(job.id, 'user_queue_13');
    assert.equal(cancelAttempt.found, true);
    assert.equal(cancelAttempt.cancelled, false);
    assert.equal(jobQueue.get(job.id)?.status, 'completed');

    // 3. Age the completed job and clip by > 1 hour and verify cleanExpiredJobsAndFiles removes them
    job.finishedAt = Date.now() - 2 * 60 * 60 * 1000;
    const clipKey = 'user_queue_13_c_valid';
    const clipMeta = clipMetadata.get(clipKey);
    if (clipMeta) {
      clipMeta.createdAt = Date.now() - 2 * 60 * 60 * 1000;
    }

    const cleanupStats = cleanExpiredJobsAndFiles(60 * 60 * 1000);
    assert.ok(cleanupStats.expiredJobs >= 1);
    assert.equal(jobQueue.has(job.id), false);
  } finally {
    if (fs.existsSync(dummyOut)) fs.unlinkSync(dummyOut);
  }
});
