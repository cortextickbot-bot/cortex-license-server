import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const allKeys = await redis.lrange('all_keys', 0, -1);
    const keys = [];

    for (const k of allKeys) {
      const data = await redis.get(`key:${k}`);
      if (data) {
        let status = data.status;
        if (status === 'active' && data.expiry_at && Date.now() > data.expiry_at) {
          status = 'expired';
        }
        let daysLeft = null;
        if (data.expiry_at && status === 'active') {
          daysLeft = Math.ceil((data.expiry_at - Date.now()) / (24 * 60 * 60 * 1000));
        }
        keys.push({
          key: k,
          account: data.account || 'Not activated',
          status: status,
          expiry_days: data.expiry_days,
          days_left: daysLeft,
          created_at: data.created_at ? new Date(data.created_at).toISOString() : null,
          activated_at: data.activated_at ? new Date(data.activated_at).toISOString() : null,
          note: data.note || ''
        });
      }
    }

    return res.status(200).json({ keys });

  } catch (error) {
    console.error('Keys list error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
