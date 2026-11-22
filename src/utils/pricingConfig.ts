export interface PlanTier {
  id: string;
  name: string;
  category?: 'restaurant' | 'vendor';
  badge?: string;
  monthlyPrice: number; // in NGN
  annualPrice: number;  // in NGN
  maxTables: number | null; // null = unlimited
  tagline: string;
  features: string[];
  annualIncentive?: string;
  recommended?: boolean;
}

export const DEFAULT_VENDOR_PLANS: PlanTier[] = [
  {
    id: 'vendor-monthly',
    name: 'Vendor Monthly',
    category: 'vendor',
    monthlyPrice: 4000,
    annualPrice: 40000,
    maxTables: null,
    tagline: 'Ideal for retail pop-ups, food stalls, bakeries & event vendors',
    annualIncentive: 'Save ₦8,000 (2 Mos Free) + 2 Free NFC Counter Stands (₦14,000 value)',
    features: [
      'Single Counter / Pop-Up Stand Menu',
      'Realistic 3D Flipbook Digital Showcase',
      'Custom Vendor URL Slug & QR Stand Code',
      'Instant Tap-to-Order for Walk-Up Customers',
      'Direct Bank Transfer & Cash POS Tracking',
      'Instant Sold-Out Item Toggle in 3 Seconds',
      'Daily Sales Volume & Performance Summary',
      'Standard WhatsApp & Email Support'
    ]
  },
  {
    id: 'vendor-pro',
    name: 'Vendor Pro',
    category: 'vendor',
    badge: 'Popular',
    monthlyPrice: 7500,
    annualPrice: 75000,
    maxTables: null,
    tagline: 'For high-volume vendors, multi-stall setups & busy retail markets',
    annualIncentive: 'Save ₦15,000 (2 Mos Free) + 5 Free NFC Counter Stands (₦35,000 value)',
    features: [
      'Everything in Vendor Monthly',
      'Multi-Stall / Multi-Location Booth Sync',
      'Salesperson & Server NFC Card Attribution Ready',
      '24-Hour Rotating Anti-Fraud Daily Access Codes',
      'Automated Staff Commission & Tip Tracking',
      'Live Shift Leaderboard & Sales Volume Rankings',
      'Exportable CSV / PDF Sales & Commission Reports',
      'Priority Phone & Dedicated Account Manager'
    ],
    recommended: true
  }
];

export const DEFAULT_PLANS: PlanTier[] = [
  {
    id: 'basic',
    name: 'Basic',
    category: 'restaurant',
    monthlyPrice: 8000,
    annualPrice: 80000,
    maxTables: 10,
    tagline: 'Ideal for small cafes, juice bars & neighborhood bistros',
    annualIncentive: 'Save ₦16,000 (2 Mos Free) + 2 Free Smart Cards (₦14,000 value)',
    features: [
      'Up to 10 Dining Tables',
      'Realistic 3D Flipbook Digital Menu',
      'Custom Restaurant URL Slug',
      'Table QR Stand Codes Generator',
      'Live Kitchen Order Tickets (KDS)',
      'Digital Table Assistance Buzzer',
      'Direct POS / Transfer / Cash Payments',
      'Standard Support'
    ]
  },
  {
    id: 'standard',
    name: 'Standard',
    category: 'restaurant',
    badge: 'Popular',
    monthlyPrice: 13000,
    annualPrice: 130000,
    maxTables: 20,
    tagline: 'Perfect for fast-growing restaurants & casual dining',
    annualIncentive: 'Save ₦26,000 (2 Mos Free) + 5 Free Smart Cards (₦35,000 value)',
    features: [
      'Up to 20 Dining Tables',
      'Everything in Basic',
      'Digital Card & NFC Encoding Ready',
      'Signature Leather & Foil Customization',
      'Dish Photo Uploads & Badges',
      'Instant Sold-Out Item Toggle',
      'Multi-Device Kitchen & Waiter Sync',
      'Priority Phone & Chat Support'
    ],
    recommended: true
  },
  {
    id: 'premium',
    name: 'Premium',
    category: 'restaurant',
    badge: 'High Volume',
    monthlyPrice: 21000,
    annualPrice: 210000,
    maxTables: 60,
    tagline: 'For busy lounges, clubs, rooftop bars & multi-floor dining',
    annualIncentive: 'Save ₦42,000 (2 Mos Free) + 10 Free Smart Cards (₦70,000 value)',
    features: [
      'Up to 60 Dining Tables',
      'Everything in Standard',
      'VIP, Bar & Patio Custom Sections',
      'Instant Category & Page Outline',
      'Kitchen Order Prep Time Tracking',
      'Dedicated Onboarding Assistance',
      'Direct Account Manager (Lagos / Abuja)'
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    category: 'restaurant',
    badge: 'Unlimited',
    monthlyPrice: 35000,
    annualPrice: 350000,
    maxTables: null,
    tagline: 'For restaurant chains, hotel dining & large hospitality venues',
    annualIncentive: 'Save ₦70,000 (2 Mos Free) + 20 Free Smart Cards (₦140,000 value)',
    features: [
      'Unlimited Dining Tables & Bars',
      'Everything in Premium',
      'Multi-Branch & Central Management',
      'Custom Domain Integration (e.g. menu.brand.com)',
      'Custom Printed Acrylic Table Stands Package',
      '99.9% High-Availability Uptime SLA',
      '24/7 VIP Concierge Support'
    ]
  }
];

import { savePlatformSettingsToSupabase, fetchPlatformSettingsFromSupabase } from './supabase';

export const PLANS_UPDATED_EVENT = 'tapmenu_plans_updated';
const STORAGE_KEY_PLANS = 'tapmenu_subscription_plans_v2';
const STORAGE_KEY_VENDOR_PLANS = 'tapmenu_vendor_plans_v1';

export function getStoredPlans(): PlanTier[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PLANS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 4) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse stored plans', e);
  }
  return DEFAULT_PLANS;
}

export function getStoredVendorPlans(): PlanTier[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VENDOR_PLANS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse stored vendor plans', e);
  }
  return DEFAULT_VENDOR_PLANS;
}

export function saveStoredPlans(plans: PlanTier[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(plans));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PLANS_UPDATED_EVENT, { detail: plans }));
    }
    // Attempt async cloud sync to Supabase (if platform_settings exists)
    savePlatformSettingsToSupabase('subscription_plans', plans).catch(() => {});
  } catch (e) {
    console.warn('Failed to save plans', e);
  }
}

export function saveStoredVendorPlans(plans: PlanTier[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_VENDOR_PLANS, JSON.stringify(plans));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PLANS_UPDATED_EVENT, { detail: plans }));
    }
    savePlatformSettingsToSupabase('vendor_subscription_plans', plans).catch(() => {});
  } catch (e) {
    console.warn('Failed to save vendor plans', e);
  }
}

export async function syncRemotePlans(): Promise<PlanTier[]> {
  try {
    const remote = await fetchPlatformSettingsFromSupabase('subscription_plans');
    if (remote && Array.isArray(remote) && remote.length >= 4) {
      saveStoredPlans(remote);
      return remote;
    }
  } catch (e) {
    console.warn('Remote plans sync fallback', e);
  }
  return getStoredPlans();
}

export function resetPlansToDefault(): PlanTier[] {
  saveStoredPlans(DEFAULT_PLANS);
  saveStoredVendorPlans(DEFAULT_VENDOR_PLANS);
  return DEFAULT_PLANS;
}
