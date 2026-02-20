import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { action, key, expiry_days } = req.body;
    const licenseKey = key.trim().toUpperCase();

    const keyData = await redis.get(`key:${licenseKey}`);
    if (!keyData) {
      return res.status(404).json({ error: 'Key not found' });
    }

    switch (action) {
      case 'revoke':
        keyData.status = 'revoked';
        await redis.set(`key:${licenseKey}`, keyData);
        return res.status(200).json({ success: true, message: 'Key revoked' });

      case 'reset':
        keyData.account = null;
        keyData.activated_at = null;
        keyData.expiry_at = null;
        keyData.status = 'active';
        await redis.set(`key:${licenseKey}`, keyData);
        return res.status(200).json({ success: true, message: 'Key reset - can be activated on new account' });

      case 'extend':
        const days = parseInt(expiry_days) || 30;
        if (keyData.expiry_at) {
          const base = Math.max(keyData.expiry_at, Date.now());
          keyData.expiry_at = base + (days * 24 * 60 * 60 * 1000);
        } else if (keyData.activated_at) {
          keyData.expiry_at = Date.now() + (days * 24 * 60 * 60 * 1000);
        }
        keyData.expiry_days = (keyData.expiry_days || 0) + days;
        keyData.status = 'active';
        await redis.set(`key:${licenseKey}`, keyData);
        return res.status(200).json({ success: true, message: `Extended by ${days} days` });

      case 'delete':
        await redis.del(`key:${licenseKey}`);
        await redis.lrem('all_keys', 0, licenseKey);
        return res.status(200).json({ success: true, message: 'Key deleted' });

      default:
        return res.status(400).json({ error: 'Invalid action. Use: revoke, reset, extend, delete' });
    }

  } catch (error) {
    console.error('Manage error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
