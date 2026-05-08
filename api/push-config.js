import { getBlobConfig, getRedisConfig, getVapidConfig, isStorageConfigured } from './_push-store.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const vapid = getVapidConfig();
  const redis = getRedisConfig();
  const blob = getBlobConfig();
  const storageConfigured = isStorageConfigured();

  res.status(200).json({
    publicKey: vapid.publicKey,
    vapidConfigured: vapid.configured,
    storageConfigured,
    storageProvider: blob.configured ? 'vercel_blob' : (redis.configured ? 'redis' : ''),
    serverPushReady: vapid.configured && storageConfigured
  });
}
