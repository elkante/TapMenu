import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles, 
  Clock, 
  AlertCircle, 
  CreditCard, 
  ArrowRight,
  ExternalLink,
  Zap,
  Lock,
  RefreshCw
} from 'lucide-react';
import { RestaurantTenant } from '../../types';
import { 
  PlanTier, 
  BillingCycle, 
  getStoredPlans, 
  getStoredVendorPlans, 
  getPlanPriceForCycle, 
  getBillingCycleMonths,
  findPlanTier
} from '../../utils/pricingConfig';

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: any) => {
        openIframe: () => void;
      };
      newTransaction: (options: any) => void;
    };
  }
}

interface PaystackCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurant: RestaurantTenant;
  initialPlanId?: string;
  initialBillingCycle?: BillingCycle;
  onSuccess: (updated: { plan: string; subscriptionExpiresAt: string }) => void;
  showNotification?: (msg: string) => void;
}

export const PaystackCheckoutModal: React.FC<PaystackCheckoutModalProps> = ({
  isOpen,
  onClose,
  restaurant,
  initialPlanId,
  initialBillingCycle = 'monthly',
  onSuccess,
  showNotification,
}) => {
  const isVendor = (restaurant.plan || '').toLowerCase().includes('vendor') || 
                   restaurant.serviceMode === 'counter_only';

  const availablePlans = isVendor ? getStoredVendorPlans() : getStoredPlans();
  const currentPlanId = (restaurant.plan || (isVendor ? 'vendor-monthly' : 'basic')).toLowerCase();

  const [selectedPlanId, setSelectedPlanId] = useState<string>(() => {
    if (initialPlanId) return initialPlanId.toLowerCase();
    return currentPlanId;
  });

  const [billingCycle, setBillingCycle] = useState<BillingCycle>(initialBillingCycle);
  const [email, setEmail] = useState<string>(() => {
    return (restaurant as any).ownerEmail || (restaurant as any).email || '';
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ plan: string; subscriptionExpiresAt: string; reference: string } | null>(null);

  // Sync initial props
  useEffect(() => {
    if (initialPlanId) setSelectedPlanId(initialPlanId.toLowerCase());
  }, [initialPlanId]);

  useEffect(() => {
    if (initialBillingCycle) setBillingCycle(initialBillingCycle);
  }, [initialBillingCycle]);

  // Load Paystack Inline script dynamically
  useEffect(() => {
    if (!isOpen) return;
    if (document.getElementById('paystack-inline-js')) return;

    const script = document.createElement('script');
    script.id = 'paystack-inline-js';
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // keep script cached
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedPlan: PlanTier = availablePlans.find(p => p.id === selectedPlanId) || availablePlans[0];
  const totalPrice = getPlanPriceForCycle(selectedPlan, billingCycle);
  const months = getBillingCycleMonths(billingCycle);

  // Compute calculated new expiry date preview
  const currentExpiryTime = restaurant.subscriptionExpiresAt 
    ? new Date(restaurant.subscriptionExpiresAt).getTime() 
    : 0;
  const now = Date.now();
  const baseTime = currentExpiryTime > now ? currentExpiryTime : now;
  const newExpiryDate = new Date(baseTime + months * 30 * 24 * 60 * 60 * 1000);

  // Handle Paystack Payment Flow
  const handleInitiatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address to receive your Paystack payment receipt.');
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Never trust the frontend: Initialize transaction securely on server
      const initRes = await fetch('/api/paystack-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          planId: selectedPlan.id,
          billingCycle,
          email: email.trim(),
        }),
      });

      const initData = await initRes.json();

      if (!initRes.ok) {
        if (initData.requiresConfig) {
          setErrorMsg(
            'Paystack Secret Key is not configured yet on your Vercel server. Please add PAYSTACK_SECRET_KEY to your environment variables.'
          );
        } else {
          setErrorMsg(initData.error || 'Failed to initialize Paystack checkout.');
        }
        setIsProcessing(false);
        return;
      }

      const { reference, accessCode, authorizationUrl, publicKey } = initData;

      // 2. Open Paystack Popup or redirect
      const pubKey = publicKey || (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY || '';

      const proceedWithVerification = async (ref: string) => {
        setIsProcessing(true);
        try {
          // 3. Server verification with Paystack Secret Key (Never trust client payment status)
          const verifyRes = await fetch('/api/paystack-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reference: ref,
              restaurantId: restaurant.id,
            }),
          });

          const verifyData = await verifyRes.json();

          if (!verifyRes.ok || !verifyData.success) {
            setErrorMsg(verifyData.error || 'Server payment verification failed. Please contact support.');
            setIsProcessing(false);
            return;
          }

          // Payment verified by server!
          setSuccessData({
            plan: verifyData.plan,
            subscriptionExpiresAt: verifyData.subscriptionExpiresAt,
            reference: ref,
          });

          onSuccess({
            plan: verifyData.plan,
            subscriptionExpiresAt: verifyData.subscriptionExpiresAt,
          });

          if (showNotification) {
            showNotification(`🎉 Payment verified! Subscription renewed for ${verifyData.months} month(s).`);
          }
        } catch (verErr: any) {
          setErrorMsg(verErr.message || 'Error communicating with verification server.');
        } finally {
          setIsProcessing(false);
        }
      };

      if (window.PaystackPop && (pubKey || accessCode)) {
        const handler = window.PaystackPop.setup({
          key: pubKey,
          email: email.trim(),
          amount: Math.round(totalPrice * 100),
          ref: reference,
          access_code: accessCode,
          currency: 'NGN',
          callback: function (response: any) {
            const confirmedRef = response?.reference || reference;
            proceedWithVerification(confirmedRef);
          },
          onClose: function () {
            setIsProcessing(false);
          },
        });
        handler.openIframe();
      } else if (authorizationUrl) {
        // Fallback to Paystack hosted checkout page if popup script blocked
        window.location.href = authorizationUrl;
      } else {
        // Fallback direct verification attempt if popup was handled externally
        proceedWithVerification(reference);
      }
    } catch (err: any) {
      console.error('Paystack checkout error:', err);
      setErrorMsg(err.message || 'Network error connecting to payment gateway.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/80 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden relative my-auto">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-stone-900 via-neutral-900 to-stone-950 text-white p-5 sm:p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Lock className="w-3 h-3 text-emerald-400" /> Paystack Secured
            </span>
            <span className="text-[11px] text-stone-400 font-medium">256-Bit Bank Grade SSL</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <span>Renew & Upgrade Subscription</span>
          </h2>
          <p className="text-xs text-stone-300 mt-1">
            {restaurant.name} &middot; Instant activation upon Paystack verification
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5">
          {successData ? (
            /* Success State */
            <div className="text-center py-6 space-y-4 animate-in zoom-in-95">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-xl font-black text-stone-900">Subscription Renewed!</h3>
                <p className="text-xs text-stone-600 mt-1 max-w-xs mx-auto">
                  Your payment has been verified by Paystack servers and applied to your account.
                </p>
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 text-left space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-stone-500">Plan Tier:</span>
                  <span className="font-bold text-stone-900 uppercase">{successData.plan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">New Expiry Date:</span>
                  <span className="font-bold text-emerald-700">
                    {new Date(successData.subscriptionExpiresAt).toLocaleDateString('en-NG', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Payment Reference:</span>
                  <span className="font-mono text-[11px] text-stone-700">{successData.reference}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-stone-900 hover:bg-stone-800 text-amber-400 font-bold rounded-xl text-sm transition-all shadow-md"
              >
                Done / Back to Dashboard
              </button>
            </div>
          ) : (
            <form onSubmit={handleInitiatePayment} className="space-y-4">
              {/* Error Alert */}
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  <div className="leading-snug">{errorMsg}</div>
                </div>
              )}

              {/* Step 1: Select Plan Tier */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  1. Select Subscription Tier
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {availablePlans.map((p) => {
                    const isSelected = p.id === selectedPlanId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPlanId(p.id)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50/80 ring-2 ring-amber-500/40 text-stone-900 shadow-xs'
                            : 'border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-black text-xs uppercase tracking-wider">{p.name}</span>
                          {p.badge && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-200/80 text-amber-900 font-extrabold">
                              {p.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono font-black text-stone-900">
                          ₦{p.monthlyPrice.toLocaleString()}<span className="text-[10px] text-stone-500 font-normal">/mo</span>
                        </div>
                        <div className="text-[10px] text-stone-500 truncate mt-0.5">
                          {p.maxTables ? `Up to ${p.maxTables} tables` : 'Unlimited counter scans'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Select Duration / Billing Cycle */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-stone-700">
                    2. Choose Renewal Duration
                  </label>
                  <span className="text-[11px] text-amber-600 font-bold">
                    {billingCycle === 'annual' ? '⭐ Best Value' : billingCycle === 'semi-annual' ? '💸 Small Discount' : 'Standard'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* 1 Month */}
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col justify-between ${
                      billingCycle === 'monthly'
                        ? 'border-stone-900 bg-stone-900 text-white shadow-md'
                        : 'border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700'
                    }`}
                  >
                    <span className="text-[11px] font-bold">1 Month</span>
                    <span className="text-xs font-mono font-black my-0.5">
                      ₦{selectedPlan.monthlyPrice.toLocaleString()}
                    </span>
                    <span className={`text-[9px] ${billingCycle === 'monthly' ? 'text-stone-300' : 'text-stone-400'}`}>
                      Monthly rate
                    </span>
                  </button>

                  {/* 6 Months - Slight discount, no perks */}
                  <button
                    type="button"
                    onClick={() => setBillingCycle('semi-annual')}
                    className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col justify-between relative ${
                      billingCycle === 'semi-annual'
                        ? 'border-stone-900 bg-stone-900 text-white shadow-md'
                        : 'border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[11px] font-bold">6 Months</span>
                      <span className="text-[8px] bg-amber-500/30 text-amber-700 px-1 rounded-sm font-bold">
                        -7%
                      </span>
                    </div>
                    <span className="text-xs font-mono font-black my-0.5">
                      ₦{getPlanPriceForCycle(selectedPlan, 'semi-annual').toLocaleString()}
                    </span>
                    <span className={`text-[9px] leading-tight ${billingCycle === 'semi-annual' ? 'text-amber-300' : 'text-stone-500'}`}>
                      Lil discount · No extra perks
                    </span>
                  </button>

                  {/* 1 Year - 2 Mos Free + Hardware Perks */}
                  <button
                    type="button"
                    onClick={() => setBillingCycle('annual')}
                    className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col justify-between relative ${
                      billingCycle === 'annual'
                        ? 'border-amber-500 bg-amber-500 text-stone-950 ring-2 ring-amber-500/50 shadow-md font-bold'
                        : 'border-amber-300 bg-amber-50/60 hover:bg-amber-100 text-stone-800'
                    }`}
                  >
                    <span className="absolute -top-2 right-2 px-1.5 py-0.2 rounded-full bg-neutral-950 text-amber-300 text-[8px] font-black uppercase">
                      2 Mos Free
                    </span>
                    <span className="text-[11px] font-extrabold">1 Year</span>
                    <span className="text-xs font-mono font-black my-0.5">
                      ₦{selectedPlan.annualPrice.toLocaleString()}
                    </span>
                    <span className="text-[9px] leading-tight text-stone-900 font-medium">
                      🎁 Free Smart Cards
                    </span>
                  </button>
                </div>

                {/* Duration Explanation Note */}
                <div className="mt-2 text-[11px] text-stone-500">
                  {billingCycle === 'semi-annual' && (
                    <div className="flex items-center gap-1.5 p-2 bg-stone-100 rounded-xl text-stone-700">
                      <span>ℹ️</span>
                      <span>
                        <strong>6 Months:</strong> Includes slight pricing discount. Standard features only (no complimentary NFC hardware perks).
                      </span>
                    </div>
                  )}
                  {billingCycle === 'annual' && selectedPlan.annualIncentive && (
                    <div className="flex items-start gap-1.5 p-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 font-medium">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>1-Year VIP Perks Included:</strong> {selectedPlan.annualIncentive}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3: Owner Billing Email */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  3. Paystack Receipt Email *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="manager@restaurant.com"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-stone-900 font-mono"
                />
              </div>

              {/* Pricing & Expiry Summary Box */}
              <div className="p-3.5 bg-stone-900 text-white rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between items-center text-stone-300">
                  <span>Selected Package:</span>
                  <span className="font-bold text-white uppercase">{selectedPlan.name} Plan ({months} Mo)</span>
                </div>
                <div className="flex justify-between items-center text-stone-300">
                  <span>New Expiration Date:</span>
                  <span className="font-bold text-amber-400">
                    {newExpiryDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="pt-2 border-t border-stone-800 flex justify-between items-baseline">
                  <span className="font-bold text-stone-300">Total Payable:</span>
                  <div className="text-right">
                    <span className="text-xl font-black font-mono text-amber-400">
                      ₦{totalPrice.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-stone-400 block">via Paystack (NGN)</span>
                  </div>
                </div>
              </div>

              {/* Submit Paystack Payment Button */}
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-3.5 bg-[#0ba4db] hover:bg-[#098bb9] text-white font-bold rounded-2xl text-sm transition-all shadow-lg active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Connecting to Paystack...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>Pay ₦{totalPrice.toLocaleString()} with Paystack →</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-2 text-[10px] text-stone-400 text-center">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Card, USSD, Bank Transfer & Apple Pay supported via Paystack</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
