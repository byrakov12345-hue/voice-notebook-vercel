import crypto from 'node:crypto';
import { get, put } from '@vercel/blob';

export const PUSH_STATE_KEY = 'smart_voice_notebook_push_state_v1';
export const PUSH_STATE_PATH = 'reminders/state.json';

export function getBlobConfig() {
  return { configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN) };
}

export function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  return { url, token, configured: Boolean(url && token) };
}

export function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  return { publicKey, privateKey, subject, configured: Boolean(publicKey && privateKey) };
}

export function isStorageConfigured() {
  return getBlobConfig().configured || getRedisConfig().configured;
}

export function subscriptionId(subscription) {
  return crypto
    .createHash('sha256')
    .update(String(subscription?.endpoint || ''))
    .digest('hex');
}

export async function redisCommand(command) {
  const config = getRedisConfig();
  if (!config.configured) {
    throw new Error('Redis REST is not configured');
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Redis REST failed: ${response.status} ${message}`);
  }

  const payload = await response.json();
  if (payload?.error) throw new Error(String(payload.error));
  return payload?.result;
}

export async function loadPushState() {
  if (getBlobConfig().configured) {
    try {
      const result = await get(PUSH_STATE_PATH, { access: 'private', useCache: false });
      if (!result?.stream) return { subscriptions: {} };
      const raw = await new Response(result.stream).text();
      const parsed = JSON.parse(raw || '{}');
      return { subscriptions: parsed.subscriptions || {} };
    } catch (error) {
      if (error?.name === 'BlobNotFoundError') return { subscriptions: {} };
      return { subscriptions: {} };
    }
  }

  const raw = await redisCommand(['GET', PUSH_STATE_KEY]);
  if (!raw) return { subscriptions: {} };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { subscriptions: {} };
    return { subscriptions: parsed.subscriptions || {} };
  } catch {
    return { subscriptions: {} };
  }
}

export async function savePushState(state) {
  if (getBlobConfig().configured) {
    await put(PUSH_STATE_PATH, JSON.stringify({
      subscriptions: state?.subscriptions || {},
      updatedAt: new Date().toISOString()
    }), {
      access: 'private',
      allowOverwrite: true,
      contentType: 'application/json'
    });
    return;
  }

  await redisCommand(['SET', PUSH_STATE_KEY, JSON.stringify({
    subscriptions: state?.subscriptions || {},
    updatedAt: new Date().toISOString()
  })]);
}

export function pruneReminderList(reminders = [], now = Date.now()) {
  const maxAgeMs = 24 * 60 * 60 * 1000;
  return reminders
    .filter(item => item && Number.isFinite(Number(item.at)))
    .filter(item => !item.sent || Number(item.at) > now - maxAgeMs)
    .slice(0, 200);
}
