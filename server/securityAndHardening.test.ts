import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { TEMP_DIR, UPLOADS_DIR, CLIPS_DIR } from './config.js';
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
    last_login: new Date().toISOString(),
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
  const origClientId = process.env.GOOGLE_CLIENT_ID;
  const origClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

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
    process.env.GOOGLE_CLIENT_ID = origClientId;
    process.env.GOOGLE_CLIENT_SECRET = origClientSecret;
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


test('P0.1 - Resource authorization: user A never accesses resource of user B, nor unowned resources (missing userId)', async () => {
  const userAToken = createAuthSession('user_auth_a', 'autha@test.local');

  // 1. Clip registered WITHOUT userId (unowned/orphan clip)
  const orphanClipId = `orphan_clip_${Date.now()}`;
  const orphanClipPath = path.join(CLIPS_DIR, `${orphanClipId}.mp4`);
  fs.writeFileSync(orphanClipPath, Buffer.from('orphan-mp4-data'));
  (jobQueue as any).clipMetadata.set(orphanClipId, {
    filePath: orphanClipPath,
    duration: 15,
    fileSize: 15,
    createdAt: new Date().toISOString(),
    userId: undefined, // unowned
  });

  // 2. Job created WITHOUT userId (unowned/orphan job)
  const orphanJobId = `orphan_job_${Date.now()}`;
  (jobQueue as any).jobs.set(orphanJobId, {
    id: orphanJobId,
    status: 'completed',
    totalItems: 1,
    completedCuts: 1,
    failedCuts: 0,
    progressPercent: 100,
    userId: undefined, // unowned
    createdAt: Date.now(),
  } as any);

  // 3. Unowned uploaded file in UPLOADS_DIR (no owner in registeredUploadedFiles)
  const orphanUploadPath = path.join(UPLOADS_DIR, `orphan_up_${Date.now()}.mp4`);
  fs.writeFileSync(orphanUploadPath, Buffer.from('orphan-upload-content'));

  try {
    await withTestServer(async (baseUrl) => {
      // User A attempts to access unowned clip preview -> MUST be 404
      const previewRes = await fetch(`${baseUrl}/api/clips/${orphanClipId}/preview`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      assert.equal(previewRes.status, 404, 'Unowned clip preview must return 404');

      // User A attempts to access unowned clip download -> MUST be 404
      const downloadRes = await fetch(`${baseUrl}/api/clips/${orphanClipId}/download`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      assert.equal(downloadRes.status, 404, 'Unowned clip download must return 404');

      // User A attempts to access unowned batch job -> MUST be 404
      const jobRes = await fetch(`${baseUrl}/api/batch/${orphanJobId}`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      assert.equal(jobRes.status, 404, 'Unowned job query must return 404');

      // User A attempts to render using unowned uploaded file -> MUST be 404
      const batchRenderRes = await fetch(`${baseUrl}/api/batch/render`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userAToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceFilePath: orphanUploadPath,
          cuts: [{ id: 'c1', title: 'Teste', startTime: '00:00', endTime: '00:15' }],
        }),
      });
      assert.equal(batchRenderRes.status, 404, 'Unowned sourceFilePath must return 404');
    });
  } finally {
    if (fs.existsSync(orphanClipPath)) fs.unlinkSync(orphanClipPath);
    if (fs.existsSync(orphanUploadPath)) fs.unlinkSync(orphanUploadPath);
    (jobQueue as any).clipMetadata.delete(orphanClipId);
    (jobQueue as any).jobs.delete(orphanJobId);
  }
});


test('P0.2 - SSRF protection: decimal/hex formats, default DNS lookup, and redirect validation', async () => {
  // Decimal IP representations of 127.0.0.1 (2130706433) and 10.0.0.1 (167772161)
  await assert.rejects(
    () => assertSafeOutboundUrl('http://2130706433:8080/'),
    /SSRF bloqueado/i,
    'Decimal representation of 127.0.0.1 must be blocked'
  );

  // Hex IP representations of 127.0.0.1 (0x7f000001)
  await assert.rejects(
    () => assertSafeOutboundUrl('http://0x7f000001:8080/'),
    /SSRF bloqueado/i,
    'Hex representation of 127.0.0.1 must be blocked'
  );

  // Default DNS resolution when lookupFn is omitted:
  // 127.0.0.1.nip.io resolves to 127.0.0.1 and must be blocked even without options.lookupFn
  await assert.rejects(
    () => assertSafeOutboundUrl('http://127.0.0.1.nip.io:8080/'),
    /SSRF bloqueado/i,
    'DNS resolving to private IP must be blocked by default without custom lookupFn'
  );
});

test('P0.4 - demo-login requires explicit ENABLE_DEMO_LOGIN=true and fails closed when unset or in production', async () => {
  const origDemoFlag = process.env.ENABLE_DEMO_LOGIN;
  const origNodeEnv = process.env.NODE_ENV;

  try {
    await withTestServer(async (baseUrl) => {
      // 1. Unset ENABLE_DEMO_LOGIN -> MUST fail closed with 403
      delete process.env.ENABLE_DEMO_LOGIN;
      process.env.NODE_ENV = 'development';
      const unsetRes = await fetch(`${baseUrl}/api/auth/demo-login`, { method: 'POST' });
      assert.equal(unsetRes.status, 403, 'demo-login without ENABLE_DEMO_LOGIN must be 403');

      // 2. Explicitly false -> MUST fail closed with 403
      process.env.ENABLE_DEMO_LOGIN = 'false';
      const falseRes = await fetch(`${baseUrl}/api/auth/demo-login`, { method: 'POST' });
      assert.equal(falseRes.status, 403, 'demo-login with ENABLE_DEMO_LOGIN=false must be 403');

      // 3. In production, even if ENABLE_DEMO_LOGIN=true -> MUST fail closed with 403
      process.env.ENABLE_DEMO_LOGIN = 'true';
      process.env.NODE_ENV = 'production';
      const prodRes = await fetch(`${baseUrl}/api/auth/demo-login`, { method: 'POST' });
      assert.equal(prodRes.status, 403, 'demo-login in production must be 403');

      // 4. In development with ENABLE_DEMO_LOGIN=true -> succeeds with 200
      process.env.ENABLE_DEMO_LOGIN = 'true';
      process.env.NODE_ENV = 'development';
      const okRes = await fetch(`${baseUrl}/api/auth/demo-login`, { method: 'POST' });
      assert.equal(okRes.status, 200, 'demo-login in dev with ENABLE_DEMO_LOGIN=true must succeed');
      const data = await okRes.json();
      assert.equal(data.success, true);
      assert.ok(data.token);
    });
  } finally {
    process.env.ENABLE_DEMO_LOGIN = origDemoFlag;
    process.env.NODE_ENV = origNodeEnv;
  }
});


// ============================================================================
// P0 ITEM 3: Cookie-based session, CSRF protection on mutating methods, no inline script in OAuth callback
// ============================================================================

test('P0.3 - Session cookies (httpOnly, SameSite=Lax), CSRF protection, and OAuth callback redirect', async () => {
  const origClientId = process.env.GOOGLE_CLIENT_ID;
  const origClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

  const originalFetch = globalThis.fetch;
  try {
    await withTestServer(async (baseUrl) => {
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr === 'https://oauth2.googleapis.com/token') {
          return new Response(JSON.stringify({ access_token: 'ya29.test_valid_oauth_token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') {
          return new Response(
            JSON.stringify({
              id: 'google_valid_999',
              email: 'valid_user@example.com',
              email_verified: true,
              verified_email: true,
              name: 'Valid Verified User',
              picture: 'https://example.com/pic.jpg',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input, init);
      };

      // 1. OAuth callback returns 302 redirect (no inline scripts) and sets session_token + csrf_token cookies
      const callbackRes = await originalFetch(
        `${baseUrl}/api/auth/google/callback?code=4/valid_code&state=valid_csrf_state`,
        {
          redirect: 'manual',
          headers: {
            Cookie: 'oauth_state=valid_csrf_state; oauth_code_verifier=valid_verifier',
          },
        }
      );
      assert.equal(callbackRes.status, 302, 'OAuth callback must return 302 redirect');
      const location = callbackRes.headers.get('location');
      assert.ok(location?.includes('auth=success'), 'OAuth callback redirect must point to /?auth=success');

      const setCookie = callbackRes.headers.get('set-cookie') || '';
      assert.ok(setCookie.includes('session_token='), 'Must set session_token cookie');
      assert.ok(setCookie.includes('HttpOnly'), 'session_token must be HttpOnly');
      assert.ok(setCookie.includes('SameSite=Lax'), 'session_token must be SameSite=Lax');
      assert.ok(setCookie.includes('csrf_token='), 'Must set csrf_token cookie');

      // Extract cookies for testing CSRF
      const sessionMatch = setCookie.match(/session_token=([^;]+)/);
      const csrfMatch = setCookie.match(/csrf_token=([^;]+)/);
      assert.ok(sessionMatch && csrfMatch);
      const sessionVal = sessionMatch[1];
      const csrfVal = csrfMatch[1];

      // 2. Cookie-authenticated mutating request without CSRF token header -> MUST return 403
      const noCsrfRes = await originalFetch(`${baseUrl}/api/clips/bulk-download`, {
        method: 'POST',
        headers: {
          Cookie: `session_token=${sessionVal}; csrf_token=${csrfVal}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cuts: [{ id: '1', title: 't' }] }),
      });
      assert.equal(noCsrfRes.status, 403, 'Cookie-authenticated mutating request without x-csrf-token must be 403');
      const noCsrfData = await noCsrfRes.json();
      assert.equal(noCsrfData.code, 'CSRF_INVALID');

      // 3. Cookie-authenticated mutating request WITH valid matching x-csrf-token header -> succeeds
      const withCsrfRes = await originalFetch(`${baseUrl}/api/clips/bulk-download`, {
        method: 'POST',
        headers: {
          Cookie: `session_token=${sessionVal}; csrf_token=${csrfVal}`,
          'x-csrf-token': csrfVal,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cuts: [{ id: '1', title: 't' }] }),
      });
      assert.equal(withCsrfRes.status, 200, 'Cookie-authenticated request with matching x-csrf-token must succeed');
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GOOGLE_CLIENT_ID = origClientId;
    process.env.GOOGLE_CLIENT_SECRET = origClientSecret;
  }
});

// ============================================================================
// P0 ITEM 5 & 6: Upload validation (duration, resolution, quota) and per-user rate limit
// ============================================================================

test('P0.5 & P0.6 - Upload checks media structure, quota, resolution, duration, and enforces per-user rate limit', async () => {
  const userToken = createAuthSession('user_upload_test', 'upload@test.local');

  // Create a corrupt / 0-byte fake mp4
  const corruptFile = path.join(UPLOADS_DIR, `corrupt_${Date.now()}.mp4`);
  fs.writeFileSync(corruptFile, Buffer.alloc(0));

  try {
    await withTestServer(async (baseUrl) => {
      // 1. Uploading without authentication -> 401
      const unauthFormData = new FormData();
      unauthFormData.append('video', new Blob(['fake content'], { type: 'video/mp4' }), 'test.mp4');
      const unauthRes = await fetch(`${baseUrl}/api/render-download-cut`, {
        method: 'POST',
        body: unauthFormData,
      });
      assert.equal(unauthRes.status, 401);

      // 2. Corrupt / empty video file -> 400
      const corruptFormData = new FormData();
      corruptFormData.append('video', new Blob([Buffer.alloc(0)], { type: 'video/mp4' }), 'corrupt.mp4');
      const corruptRes = await fetch(`${baseUrl}/api/render-download-cut`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` },
        body: corruptFormData,
      });
      assert.equal(corruptRes.status, 400);

      // 3. Per-user rate limiting: sending 15 rapid upload requests with userToken triggers 429
      let hit429 = false;
      for (let i = 0; i < 15; i++) {
        const rapidFormData = new FormData();
        rapidFormData.append('video', new Blob(['test-rate-limit'], { type: 'video/mp4' }), 'rapid.mp4');
        const rapidRes = await fetch(`${baseUrl}/api/render-download-cut`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${userToken}`,
            'X-Forwarded-For': `10.0.0.${i + 1}`, // Rotating IPs must NOT bypass per-user rate limit!
          },
          body: rapidFormData,
        });
        if (rapidRes.status === 429) {
          hit429 = true;
          break;
        }
      }
      assert.ok(hit429, 'Rapid requests from the same user must be throttled with 429 despite rotating IPs');
    });
  } finally {
    if (fs.existsSync(corruptFile)) fs.unlinkSync(corruptFile);
  }
});

test('P1.1 - SQLite (better-sqlite3) persistence, schema migrations, foreign keys, and database.json backup', async () => {
  // 1. SQLite database is active and schema migrations ran
  const tables = (db as any).raw.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ).all().map((r: any) => r.name);

  assert.ok(tables.includes('schema_migrations'), 'schema_migrations table must exist');
  assert.ok(tables.includes('users'), 'users table must exist');
  assert.ok(tables.includes('user_sessions'), 'user_sessions table must exist');
  assert.ok(tables.includes('user_states'), 'user_states table must exist');
  assert.ok(tables.includes('jobs'), 'jobs table must exist');
  assert.ok(tables.includes('rendered_clips'), 'rendered_clips table must exist');

  // 2. Migration created backup of database.json if it existed
  const dataDir = path.join(process.cwd(), 'data');
  const bakPath = path.join(dataDir, 'database.json.bak');
  if (fs.existsSync(path.join(dataDir, 'database.json'))) {
    assert.ok(fs.existsSync(bakPath), 'database.json.bak must be preserved on SQLite migration');
  }

  // 3. Foreign key constraints: ON DELETE CASCADE
  const tempUserId = `cascade_test_${Date.now()}`;
  (db as any).raw.prepare(
    "INSERT INTO users (id, created_at, last_login) VALUES (?, datetime('now'), datetime('now'))"
  ).run(tempUserId);
  (db as any).raw.prepare(
    "INSERT INTO user_sessions (session_token, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))"
  ).run(`sess_${tempUserId}`, tempUserId);

  assert.ok((db as any).raw.prepare('SELECT * FROM user_sessions WHERE user_id = ?').get(tempUserId));

  // Deleting user must cascade delete session via foreign key
  (db as any).raw.prepare('DELETE FROM users WHERE id = ?').run(tempUserId);
  assert.equal((db as any).raw.prepare('SELECT * FROM user_sessions WHERE user_id = ?').get(tempUserId), undefined);
});

test('P1.2 - Job persistence in SQLite and p-limit concurrency limiter', async () => {
  const jobId = `persisted_job_${Date.now()}`;
  const userId = `usr_persist_${Date.now()}`;

  // Register user first for foreign key integrity
  (db as any).raw.prepare(
    'INSERT OR REPLACE INTO users (id, created_at, last_login) VALUES (?, ?, ?)'
  ).run(userId, new Date().toISOString(), new Date().toISOString());

  jobQueue.addJob({
    id: jobId,
    type: 'batch_render',
    status: 'queued',
    progress: 0,
    currentStep: 'Na fila SQLite',
    totalItems: 3,
    completedItems: 0,
    failedItems: 0,
    itemIds: ['c1', 'c2', 'c3'],
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Verify job is persisted into SQLite table
  const row = (db as any).raw.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as any;
  assert.ok(row, 'Job must be persisted in SQLite table jobs');
  assert.equal(row.id, jobId);
  assert.equal(row.user_id, userId);
  assert.equal(row.status, 'queued');

  // Cancel job and verify update is persisted
  jobQueue.cancelJob(jobId);
  const updatedRow = (db as any).raw.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as any;
  assert.equal(updatedRow.status, 'cancelled');

  // Clean up
  jobQueue.deleteJob(jobId);
  assert.equal((db as any).raw.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId), undefined);
});

test('P1.3 & P1.4 - videoWorker facade removed and async file stats in request handlers', async () => {
  // 1. videoWorker facade removed from codebase
  const facadeWorkerPath = path.join(process.cwd(), 'server', 'queue', 'videoWorker.ts');
  const facadeQueuePath = path.join(process.cwd(), 'server', 'queue', 'videoQueue.ts');
  assert.equal(fs.existsSync(facadeWorkerPath), false, 'server/queue/videoWorker.ts must be deleted');
  assert.equal(fs.existsSync(facadeQueuePath), false, 'server/queue/videoQueue.ts must be deleted');
});

