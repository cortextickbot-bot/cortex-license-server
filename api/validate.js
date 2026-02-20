import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Method not allowed' });

  try {
    const { key, account } = req.body;

    if (!key || !account) {
      return res.status(400).json({ status: 'error', message: 'Missing key or account' });
    }

    const licenseKey = key.trim().toUpperCase();
    const accountNum = String(account).trim();

    const keyData = await redis.get(`key:${licenseKey}`);

    if (!keyData) {
      return res.status(200).json({ status: 'invalid', message: 'Invalid license key. Contact Telegram - @cortextickbot' });
    }

    if (keyData.status === 'revoked') {
      return res.status(200).json({ status: 'revoked', message: 'License revoked. Contact Telegram - @cortextickbot' });
    }

    if (!keyData.account) {
      keyData.account = accountNum;
      keyData.activated_at = Date.now();
      keyData.expiry_at = Date.now() + (keyData.expiry_days * 24 * 60 * 60 * 1000);
      await redis.set(`key:${licenseKey}`, keyData);
      const daysLeft = keyData.expiry_days;
      return res.status(200).json({ status: 'valid', message: `License activated! ${daysLeft} days remaining`, days_left: daysLeft, account: accountNum });
    }

    if (keyData.account !== accountNum) {
      return res.status(200).json({ status: 'bound', message: 'Key already used on another account. Contact Telegram - @cortextickbot' });
    }

    if (keyData.expiry_at && Date.now() > keyData.expiry_at) {
      return res.status(200).json({ status: 'expired', message: 'License expired. Contact Telegram - @cortextickbot' });
    }

    const daysLeft = Math.ceil((keyData.expiry_at - Date.now()) / (24 * 60 * 60 * 1000));
    return res.status(200).json({ status: 'valid', message: `License valid. ${daysLeft} days remaining`, days_left: daysLeft, account: accountNum });

  } catch (error) {
    console.error('Validate error:', error);
    return res.status(500).json({ status: 'error', message: 'Server error. Try again later.' });
  }
}
