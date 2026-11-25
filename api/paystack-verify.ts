import { createClient } from '@supabase/supabase-js';
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

function getExpectedAmountKobo(planId: string, cycle: BillingCycle): number {
  const normId = (planId || '').toLowerCase();
  const allPlans = [...DEFAULT_PLANS, ...DEFAULT_VENDOR_PLANS];
  const plan = allPlans.find(p => p.id === normId) || DEFAULT_PLANS[0];

  let amountNgn = plan.monthlyPrice;
  if (cycle === 'annual') amountNgn = plan.annualPrice;
  else if (cycle === 'semi-annual') amountNgn = plan.sixMonthsPrice || Math.round(plan.monthlyPrice * 5.6);

  return Math.round(amountNgn * 100);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { reference, restaurantId } = req.body || {};

    if (!reference || typeof reference !== 'string') {
      return res.status(400).json({ error: 'Missing transaction reference.' });
    }

    if (!restaurantId || typeof restaurantId !== 'string') {
      return res.status(400).json({ error: 'Missing restaurantId.' });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return res.status(503).json({
        error: 'PAYSTACK_SECRET_KEY is not configured on the server.',
      });
    }

    // Server-to-server verification with Paystack API
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference.trim())}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey.trim()}`,
        'Content-Type': 'application/json',
      },
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.status) {
      console.error('Paystack verification error:', verifyData);
      return res.status(400).json({
        error: verifyData.message || 'Verification failed with Paystack.',
      });
    }

    const tx = verifyData.data;

    // 1. Validate transaction status
    if (tx.status !== 'success') {
      return res.status(400).json({
        error: `Transaction was not successful. Current status: ${tx.status}`,
      });
    }

    // 2. Validate restaurant matches
    const metaRestaurantId = tx.metadata?.restaurant_id;
    if (metaRestaurantId && metaRestaurantId !== restaurantId) {
      return res.status(403).json({
        error: 'Security alert: Transaction metadata does not match target restaurant.',
      });
    }

    // 3. Validate plan and amount paid
    const planId = tx.metadata?.plan_id || 'basic';
    const cycle = (tx.metadata?.billing_cycle as BillingCycle) || 'monthly';
    const expectedKobo = tx.metadata?.expected_amount_kobo || getExpectedAmountKobo(planId, cycle);

    if (tx.amount < expectedKobo) {
      return res.status(400).json({
        error: `Payment amount underpaid! Received ₦${tx.amount / 100}, expected ₦${expectedKobo / 100}.`,
      });
    }

    const months = Number(tx.metadata?.months) || (cycle === 'annual' ? 12 : cycle === 'semi-annual' ? 6 : 1);

    // Initialize Supabase admin client
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://kxszokrflzknhtsicbzm.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_uHLP5_-WK_mZH-fHd_e3AQ_6XhkviZJ';

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch existing restaurant row to calculate renewal date
    let existingExpiresAt: number = 0;
    let existingDesign: Record<string, any> = {};

    try {
      const { data: restRow } = await supabase
        .from('restaurants')
        .select('subscription_expires_at, design, status')
        .eq('id', restaurantId)
        .maybeSingle();

      if (restRow) {
        if (restRow.subscription_expires_at) {
          existingExpiresAt = new Date(restRow.subscription_expires_at).getTime();
        }
        if (restRow.design && typeof restRow.design === 'object') {
          existingDesign = restRow.design;
        }
      }
    } catch (e) {
      console.warn('Could not read existing expiry from DB:', e);
    }

    // If still active in the future, extend from existing expiry date; otherwise extend from NOW
    const now = Date.now();
    const baseTime = existingExpiresAt > now ? existingExpiresAt : now;
    const addedMs = months * 30 * 24 * 60 * 60 * 1000;
    const newExpiresAt = new Date(baseTime + addedMs).toISOString();

    // Determine table limit based on plan
    let tableLimit: number | null = null;
    if (planId === 'basic') tableLimit = 10;
    else if (planId === 'standard') tableLimit = 20;
    else if (planId === 'premium') tableLimit = 60;
    else if (planId === 'enterprise' || planId.includes('vendor')) tableLimit = null;

    // Update restaurant record in Supabase
    const { error: updateError } = await supabase
      .from('restaurants')
      .update({
        plan: planId,
        status: 'active',
        subscription_expires_at: newExpiresAt,
        table_limit: tableLimit,
        design: {
          ...existingDesign,
          plan: planId,
          subscriptionExpiresAt: newExpiresAt,
        },
      })
      .eq('id', restaurantId);

    if (updateError) {
      console.warn('Supabase restaurant update warning:', updateError);
    }

    // Try logging the verified transaction for idempotency & auditing
    try {
      await supabase.from('subscription_transactions').upsert(
        {
          reference: tx.reference,
          restaurant_id: restaurantId,
          plan_id: planId,
          billing_cycle: cycle,
          months,
          amount_kobo: tx.amount,
          currency: tx.currency || 'NGN',
          customer_email: tx.customer?.email || tx.metadata?.email,
          channel: tx.channel || 'paystack',
          paid_at: tx.paid_at || new Date().toISOString(),
          expires_at: newExpiresAt,
        },
        { onConflict: 'reference' }
      );
    } catch (auditErr) {
      // Table may not exist yet in client schema; non-fatal
      console.warn('Subscription audit log note:', auditErr);
    }

    return res.status(200).json({
      success: true,
      reference: tx.reference,
      plan: planId,
      billingCycle: cycle,
      months,
      amountNgn: tx.amount / 100,
      subscriptionExpiresAt: newExpiresAt,
      message: `Payment verified! Subscription extended by ${months} month${months > 1 ? 's' : ''}.`,
    });
  } catch (err: any) {
    console.error('Paystack verify exception:', err);
    return res.status(500).json({
      error: err.message || 'Internal error verifying payment.',
    });
  }
}
