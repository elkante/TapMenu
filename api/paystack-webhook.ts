import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

interface ApiRequest {
  method?: string;
  body?: any;
  headers: Record<string, string | string[] | undefined>;
  on?: (event: string, callback: (...args: any[]) => void) => void;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  send: (data: any) => void;
  json: (data: any) => void;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to buffer request body
async function getRawBody(req: ApiRequest): Promise<string> {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);

  return new Promise((resolve, reject) => {
    let data = '';
    if (req.on) {
      req.on('data', chunk => {
        data += chunk;
      });
      req.on('end', () => {
        resolve(data);
      });
      req.on('error', err => {
        reject(err);
      });
    } else {
      resolve('');
    }
  });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).send('Secret key not configured');
  }

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['x-paystack-signature'] as string;

    if (!signature) {
      return res.status(401).send('Missing Paystack signature');
    }

    // Verify HMAC SHA512 signature
    const hash = crypto.createHmac('sha512', secretKey.trim()).update(rawBody).digest('hex');
    if (hash !== signature) {
      return res.status(401).send('Invalid signature');
    }

    const event = JSON.parse(rawBody);

    if (event.event === 'charge.success') {
      const data = event.data;
      const restaurantId = data.metadata?.restaurant_id;
      const planId = data.metadata?.plan_id || 'basic';
      const months = Number(data.metadata?.months) || 1;

      if (restaurantId) {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://kxszokrflzknhtsicbzm.supabase.co';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_uHLP5_-WK_mZH-fHd_e3AQ_6XhkviZJ';
        const supabase = createClient(supabaseUrl, supabaseKey);

        let existingExpiresAt = Date.now();
        try {
          const { data: restRow } = await supabase
            .from('restaurants')
            .select('subscription_expires_at')
            .eq('id', restaurantId)
            .maybeSingle();

          if (restRow?.subscription_expires_at) {
            existingExpiresAt = new Date(restRow.subscription_expires_at).getTime();
          }
        } catch {}

        const baseTime = existingExpiresAt > Date.now() ? existingExpiresAt : Date.now();
        const addedMs = months * 30 * 24 * 60 * 60 * 1000;
        const newExpiresAt = new Date(baseTime + addedMs).toISOString();

        await supabase
          .from('restaurants')
          .update({
            plan: planId,
            status: 'active',
            subscription_expires_at: newExpiresAt,
          })
          .eq('id', restaurantId);
      }
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Webhook error:', err);
    return res.status(500).send('Webhook handler error');
  }
}
