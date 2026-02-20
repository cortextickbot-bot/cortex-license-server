import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () => {
    let s = '';
    for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };
  return `CTX-${part()}-${part()}-${part()}`;
}

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
    const { expiry_days = 30, note = '' } = req.body;

    const licenseKey = generateKey();
    const keyData = {
      key: licenseKey,
      account: null,
      created_at: Date.now(),
      activated_at: null,
      expiry_days: parseInt(expiry_days),
      expiry_at: null,
      status: 'active',
      note: note
    };

    await redis.set(`key:${licenseKey}`, keyData);
    await redis.lpush('all_keys', licenseKey);

    return res.status(200).json({
      success: true,
      key: licenseKey,
      expiry_days: parseInt(expiry_days),
      note: note
    });

  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
