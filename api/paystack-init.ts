import { DEFAULT_PLANS, DEFAULT_VENDOR_PLANS, BillingCycle } from '../src/utils/pricingConfig';

interface ApiRequest {
  method?: string;
  body?: any;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[]>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: any) => void;
  send: (data: any) => void;
  setHeader: (name: string, value: string) => void;
}

function calculateServerPrice(planId: string, cycle: BillingCycle): { amountNgn: number; amountKobo: number; months: number; planName: string } {
  const normId = (planId || '').toLowerCase();
  const allPlans = [...DEFAULT_PLANS, ...DEFAULT_VENDOR_PLANS];
  const plan = allPlans.find(p => p.id === normId) || DEFAULT_PLANS[0];

  let amountNgn = plan.monthlyPrice;
  let months = 1;

  if (cycle === 'annual') {
    amountNgn = plan.annualPrice;
    months = 12;
  } else if (cycle === 'semi-annual') {
    amountNgn = plan.sixMonthsPrice || Math.round(plan.monthlyPrice * 5.6);
    months = 6;
  } else {
    amountNgn = plan.monthlyPrice;
    months = 1;
  }

  return {
    amountNgn,
    amountKobo: Math.round(amountNgn * 100),
    months,
    planName: plan.name,
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // Only accept POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { restaurantId, planId, billingCycle, email } = req.body || {};

    if (!restaurantId || typeof restaurantId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid restaurantId.' });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required for Paystack receipt.' });
    }

    const cycle: BillingCycle = billingCycle === 'annual' ? 'annual' : billingCycle === 'semi-annual' ? 'semi-annual' : 'monthly';
    const { amountNgn, amountKobo, months, planName } = calculateServerPrice(planId, cycle);

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const publicKey = process.env.VITE_PAYSTACK_PUBLIC_KEY || process.env.PAYSTACK_PUBLIC_KEY;

    if (!secretKey) {
      return res.status(503).json({
        error: 'PAYSTACK_SECRET_KEY is not configured on the server. Please add it to your environment variables.',
        requiresConfig: true,
      });
    }

    // Generate unique unguessable reference
    const uniqueSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const reference = `TM_${restaurantId.substring(0, 6)}_${Date.now()}_${uniqueSuffix}`;

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'tapmenu.net';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = `${proto}://${host}`;

    // Initialize transaction directly on Paystack servers
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        amount: amountKobo,
        reference,
        currency: 'NGN',
        callback_url: `${origin}/?payment_ref=${reference}`,
        metadata: {
          restaurant_id: restaurantId,
          plan_id: planId,
          plan_name: planName,
          billing_cycle: cycle,
          months,
          expected_amount_kobo: amountKobo,
          source: 'TapMenu Web POS',
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackRes.ok || !paystackData.status) {
      console.error('Paystack init failed:', paystackData);
      return res.status(400).json({
        error: paystackData.message || 'Failed to initialize Paystack transaction.',
      });
    }

    return res.status(200).json({
      success: true,
      reference,
      accessCode: paystackData.data?.access_code,
      authorizationUrl: paystackData.data?.authorization_url,
      amount: amountNgn,
      amountKobo,
      currency: 'NGN',
      months,
      planName,
      publicKey: publicKey || '',
    });
  } catch (err: any) {
    console.error('Paystack init exception:', err);
    return res.status(500).json({
      error: err.message || 'Internal server error initializing transaction.',
    });
  }
}
