import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSafeYouTubeUrl,
  sanitizeTimestamp,
  validateCutInterval,
  parseTimeToSeconds,
} from '../middleware/security.js';
import { buildSafeCredentials } from '../routes/stateRoutes.js';
import { authMiddleware } from '../middleware/auth.js';
import db from '../db.js';

test('Security: normalizeSafeYouTubeUrl strictly validates YouTube URLs and blocks injection', () => {
  // Valid URLs
  const normal = normalizeSafeYouTubeUrl('https://www.youtube.com/watch?v=B57eOqeLVfc');
  assert.equal(normal?.videoId, 'B57eOqeLVfc');
  assert.equal(normal?.canonicalUrl, 'https://www.youtube.com/watch?v=B57eOqeLVfc');

  const short = normalizeSafeYouTubeUrl('https://youtu.be/B57eOqeLVfc');
  assert.equal(short?.videoId, 'B57eOqeLVfc');

  const directId = normalizeSafeYouTubeUrl('B57eOqeLVfc');
  assert.equal(directId?.videoId, 'B57eOqeLVfc');

  // Command injection attempts and invalid characters
  assert.equal(normalizeSafeYouTubeUrl('https://youtube.com/watch?v=B57eOqeLVfc; rm -rf /'), null);
  assert.equal(normalizeSafeYouTubeUrl('--help'), null);
  assert.equal(normalizeSafeYouTubeUrl('https://attacker.com/evil.mp4'), null);
  assert.equal(normalizeSafeYouTubeUrl(''), null);
});

test('Security: Timestamp parsing and cut interval validation strictly enforce limits', () => {
  // Parsing
  assert.equal(parseTimeToSeconds('01:30'), 90);
  assert.equal(parseTimeToSeconds('00:45'), 45);
  assert.equal(parseTimeToSeconds('01:00:00'), 3600);

  // Invalid minute/second values return NaN
  assert.ok(isNaN(parseTimeToSeconds('00:65')));
  assert.ok(isNaN(parseTimeToSeconds('invalid:time')));

  // Interval validation
  assert.equal(validateCutInterval('00:00', '00:45').valid, true);
  assert.equal(validateCutInterval('00:45', '00:10').valid, false);
  assert.equal(validateCutInterval('00:00', '06:30').valid, false); // exceeds default 300s
  assert.equal(validateCutInterval('00:00', '00:65').valid, false);

  // Sanitize fallback
  assert.equal(sanitizeTimestamp('00:30'), '00:30');
  assert.equal(sanitizeTimestamp('invalid-time', '00:15'), '00:15');
});

test('Security: buildSafeCredentials never leaks raw tokens, client secrets, API keys or cookies', () => {
  const unsafeCreds: any = {
    youtube: {
      accessToken: 'ya29.a0AfH6SMD_secret_token_1234567890',
      refreshToken: '1//04_super_secret_refresh_token_xyz',
      clientId: 'my-client-id-123.apps.googleusercontent.com',
      clientSecret: 'secret_client_secret_abc123',
      cookies: '# Netscape HTTP Cookie File\n.youtube.com TRUE / FALSE 12345 SID secret_cookie',
      status: 'connected',
      channelTitle: 'Meu Canal',
    },
    gemini: {
      apiKey: 'AIzaSy_super_secret_gemini_api_key',
      status: 'connected',
    },
    webhooks: {
      discordWebhookUrl: 'https://discord.com/api/webhooks/12345/abcdef_token',
      telegramBotToken: '123456789:ABCdefGHI_secret_bot_token',
      telegramChatId: '987654321',
    },
  };

  const safe = buildSafeCredentials(unsafeCreds);

  // Ensure raw secrets are NEVER exposed in the output
  assert.ok(!JSON.stringify(safe).includes('ya29.a0AfH6SMD_secret_token_1234567890'));
  assert.ok(!JSON.stringify(safe).includes('1//04_super_secret_refresh_token_xyz'));
  assert.ok(!JSON.stringify(safe).includes('secret_client_secret_abc123'));
  assert.ok(!JSON.stringify(safe).includes('secret_cookie'));
  assert.ok(!JSON.stringify(safe).includes('AIzaSy_super_secret_gemini_api_key'));
  assert.ok(!JSON.stringify(safe).includes('abcdef_token'));
  assert.ok(!JSON.stringify(safe).includes('ABCdefGHI_secret_bot_token'));

  // Ensure boolean indicators or masks are used instead
  assert.equal(safe.youtube.hasRefreshToken, true);
  assert.equal(safe.youtube.hasCookies, true);
  assert.equal(safe.youtube.clientSecret, '••••••••');
  assert.ok(safe.youtube.accessToken.includes('••••••••'));
  assert.ok(safe.gemini?.apiKey?.includes('••••••••'));
});

test('Security: authMiddleware rejects unauthenticated requests and does NOT fallback to default', () => {
  let statusSet: number | null = null;
  let jsonOutput: any = null;
  let nextCalled = false;

  const req: any = {
    path: '/api/storage/state',
    headers: {},
  };

  const res: any = {
    status(code: number) {
      statusSet = code;
      return this;
    },
    json(payload: any) {
      jsonOutput = payload;
      return this;
    },
  };

  const next = () => {
    nextCalled = true;
  };

  authMiddleware(req, res, next);

  assert.equal(nextCalled, false, 'Protected route must not call next() without auth');
  assert.equal(statusSet, 401, 'Protected route must return HTTP 401');
  assert.equal(jsonOutput?.code, 'UNAUTHORIZED');
  assert.equal(req.userId, '', 'User ID must not fallback to default');
  assert.equal(req.user, undefined);
});

test('Security: authMiddleware deletes expired sessions and rejects them', () => {
  const expiredToken = `expired_token_${Date.now()}`;
  const pastIso = new Date(Date.now() - 60000).toISOString();

  // Insert expired session
  db.prepare(
    'INSERT INTO user_sessions (session_token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(expiredToken, 'any_user', pastIso, pastIso);

  let statusSet: number | null = null;
  const req: any = {
    path: '/api/settings/credentials',
    headers: {
      authorization: `Bearer ${expiredToken}`,
    },
  };

  const res: any = {
    status(code: number) {
      statusSet = code;
      return this;
    },
    json() {
      return this;
    },
  };

  let nextCalled = false;
  authMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(statusSet, 401);
  assert.equal(nextCalled, false);

  // Verify expired session was removed from DB
  const check = db.prepare('SELECT * FROM user_sessions WHERE session_token = ?').get(expiredToken);
  assert.equal(check, undefined, 'Expired session should be deleted from database');
});
