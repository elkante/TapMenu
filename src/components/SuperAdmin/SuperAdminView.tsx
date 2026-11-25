import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { RestaurantTenant } from '../../types';
import { sanitizeRestaurantLogo } from '../../utils/logoSanitizer';
import { 
  fetchAllRestaurantsFromSupabase, 
  updateRestaurantStatusInSupabase, 
  deleteRestaurantFromSupabase,
  updateRestaurantPlanInSupabase,
  setActiveSession,
  registerRestaurant,
  fetchPlatformContactConfig,
  savePlatformContactConfig,
  syncRestaurantMetaToSupabase,
  PlatformContactConfig,
  DEFAULT_PLATFORM_CONTACT,
  supabase
} from '../../utils/supabase';
import { 
  getStoredPlans, 
  saveStoredPlans, 
  getStoredVendorPlans,
  saveStoredVendorPlans,
  resetPlansToDefault, 
  syncRemotePlans,
  PlanTier 
} from '../../utils/pricingConfig';
import { CardOrderRequest } from '../../types';
import { getStoredCardOrders, updateCardOrderStatus } from '../../utils/cardOrderStorage';
import { NotchedBottomBar } from '../Navigation/NotchedBottomBar';
import { getAbsoluteTableUrl, getAbsoluteVendorUrl } from '../../utils/canonicalUrl';
import { generateQrDataUrl, generateHighResQrDataUrl } from '../../utils/nfc';
import { 
  ShieldCheck, 
  Building2, 
  Users, 
  TrendingUp, 
  Plus, 
  MessageCircle,
  Settings,
  Phone,
  ExternalLink, 
  Trash2,
  Download, 
  CheckCircle2, 
  Lock, 
  Search, 
  RefreshCw, 
  ArrowLeft, 
  Store, 
  CreditCard, 
  Package, 
  KeyRound, 
  Utensils, 
  PhoneCall, 
  Clock,
  Sparkles,
  Eye,
  Save,
  RotateCcw,
  AlertCircle,
  QrCode,
  X,
  Zap,
  Pause,
  Play
} from 'lucide-react';

// Cryptographic Salt & Precomputed SHA-256 Hashes
// (The plain-text passcodes never exist in source code or client JS bundles)
const PASSCODE_SALT = 'tapmenu_salt_2026_x9';
const VALID_HASHES = [
  '56101a6eebd4fafbe3defe7901bfcaebc67c4347654ce45f68e4bbcc41f42113', // primary hash
  '2c0b5d2dd923a8005745f5034338ab93f2f8a73fe9661f4c21c9e76bd55fefb9'  // legacy fallback hash
];

async function computeSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const SESSION_TOKEN_KEY = 'tapmenu_admin_session_sig';
const SESSION_TIME_KEY = 'tapmenu_admin_session_ts';
const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes auto-timeout

const LocalQrImage: React.FC<{ url: string; alt: string; className?: string }> = ({ url, alt, className }) => {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    let active = true;
    generateQrDataUrl(url).then(dataUrl => {
      if (active && dataUrl) setSrc(dataUrl);
    });
    return () => { active = false; };
  }, [url]);

  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-neutral-100 animate-pulse ${className || 'w-44 h-44 rounded-lg'}`}>
        <QrCode className="w-10 h-10 text-neutral-300" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} />;
};
const LOCKOUT_KEY = 'tapmenu_admin_lockout_ts';
const ATTEMPTS_KEY = 'tapmenu_admin_failed_attempts';

export const SuperAdminView: React.FC = () => {
  const { showNotification } = useApp();

  // Authentication State
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'passcode' | 'supabase'>('supabase');
  const [pinInput, setPinInput] = useState('');
  const [adminEmail, setAdminEmail] = useState('admin@tm.com');
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  // Data
  const [tenants, setTenants] = useState<RestaurantTenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'restaurant' | 'vendor'>('all');
  const [activeTab, setActiveTab] = useState<'restaurants' | 'plans' | 'settings' | 'hardware'>('restaurants');

  // Live Subscription Plans
  const [plans, setPlans] = useState<PlanTier[]>(() => getStoredPlans());
  const [vendorPlans, setVendorPlans] = useState<PlanTier[]>(() => getStoredVendorPlans());
  const [hasPlanChanges, setHasPlanChanges] = useState(false);

  // Card hardware orders
  const [cardOrders, setCardOrders] = useState<CardOrderRequest[]>(() => getStoredCardOrders());

  // Delete & Purge Modal with Required Typing Confirmation
  const [purgeTarget, setPurgeTarget] = useState<RestaurantTenant | null>(null);
  const [purgeInput, setPurgeInput] = useState('');
  const [isPurging, setIsPurging] = useState(false);

  // Platform WhatsApp & Contact Settings
  const [contactConfig, setContactConfig] = useState<PlatformContactConfig>(DEFAULT_PLATFORM_CONTACT);
  const [isSavingContact, setIsSavingContact] = useState(false);

  // Modal: Onboard new restaurant or vendor
  const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
  const [onboardBusinessType, setOnboardBusinessType] = useState<'restaurant' | 'vendor'>('restaurant');
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPlan, setNewPlan] = useState<'Basic' | 'Standard' | 'Premium' | 'Enterprise' | 'Vendor'>('Standard');
  const [qrModalTenant, setQrModalTenant] = useState<RestaurantTenant | null>(null);
  const [selectedTableIdx, setSelectedTableIdx] = useState<number>(0);
  const [viewingCacModal, setViewingCacModal] = useState<{ url: string; tenantName: string; tenantId: string; status: string } | null>(null);
  const [cacFilterOnly, setCacFilterOnly] = useState(false);

  // Load all restaurants from Supabase (merging local cache)
  const loadAllTenants = async () => {
    setLoading(true);
    try {
      const data = await fetchAllRestaurantsFromSupabase();
      setTenants(data);
    } catch (err) {
      console.warn('Failed to load restaurants from Supabase:', err);
    } finally {
      setLoading(false);
    }
  };

  // Sync latest remote plans on mount
  useEffect(() => {
    syncRemotePlans().then(live => {
      if (live) setPlans(live);
    });
    fetchPlatformContactConfig().then(cfg => {
      if (cfg) setContactConfig(cfg);
    });
  }, []);

  // Fetch tenants whenever SuperAdmin becomes unlocked
  useEffect(() => {
    if (isUnlocked) {
      loadAllTenants();
      fetchPlatformContactConfig().then(cfg => {
        if (cfg) setContactConfig(cfg);
      });
    }
  }, [isUnlocked]);

  // Verify cryptographic session on load
  useEffect(() => {
    const verifyStoredSession = async () => {
      const ts = sessionStorage.getItem(SESSION_TIME_KEY);
      const sig = sessionStorage.getItem(SESSION_TOKEN_KEY);
      if (!ts || !sig) {
        setIsUnlocked(false);
        return;
      }
      const age = Date.now() - parseInt(ts, 10);
      if (isNaN(age) || age < 0 || age > SESSION_MAX_AGE_MS) {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_TIME_KEY);
        setIsUnlocked(false);
        return;
      }
      const expectedSig = await computeSha256(ts + PASSCODE_SALT + 'authenticated_super_admin');
      if (sig === expectedSig) {
        setIsUnlocked(true);
      } else {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_TIME_KEY);
        setIsUnlocked(false);
      }
    };

    // Check lockout on load
    const lockoutUntil = Number(sessionStorage.getItem(LOCKOUT_KEY) || 0);
    const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
    if (remaining > 0) {
      setLockoutSeconds(remaining);
      setAuthError(`Security lockout active. Try again in ${remaining}s.`);
    }

    verifyStoredSession();
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          sessionStorage.removeItem(LOCKOUT_KEY);
          sessionStorage.removeItem(ATTEMPTS_KEY);
          setAuthError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  const recordFailedAttempt = () => {
    const attempts = Number(sessionStorage.getItem(ATTEMPTS_KEY) || 0) + 1;
    sessionStorage.setItem(ATTEMPTS_KEY, String(attempts));
    if (attempts >= 4) {
      const lockoutUntil = Date.now() + 5 * 60 * 1000; // 5 min lockout
      sessionStorage.setItem(LOCKOUT_KEY, String(lockoutUntil));
      setLockoutSeconds(300);
      setAuthError('Too many failed attempts. Security lockout active for 5 minutes.');
    } else {
      setAuthError(`Access Denied: Invalid credentials. (${4 - attempts} attempt${4 - attempts !== 1 ? 's' : ''} left before lockout)`);
    }
  };

  const createAuthorizedSession = async () => {
    const now = Date.now().toString();
    const sig = await computeSha256(now + PASSCODE_SALT + 'authenticated_super_admin');
    sessionStorage.setItem(SESSION_TIME_KEY, now);
    sessionStorage.setItem(SESSION_TOKEN_KEY, sig);
    sessionStorage.removeItem(ATTEMPTS_KEY);
    sessionStorage.removeItem(LOCKOUT_KEY);
    setIsUnlocked(true);
    setAuthError(null);
  };

  const handlePasscodeUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const clean = pinInput.trim().toLowerCase();
      const hash = await computeSha256(PASSCODE_SALT + clean);
      if (VALID_HASHES.includes(hash)) {
        await createAuthorizedSession();
        setPinInput('');
        showNotification('Super-Admin identity verified.');
      } else {
        recordFailedAttempt();
      }
    } catch {
      recordFailedAttempt();
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSupabaseUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    if (!supabase) {
      setAuthError('Supabase is not configured.');
      return;
    }
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: adminEmail.trim(),
        password: adminPassword,
      });

      if (error || !data?.user) {
        recordFailedAttempt();
      } else {
        await createAuthorizedSession();
        setAdminPassword('');
        showNotification(`Welcome, ${data.user.email}! Super-Admin identity verified.`);
      }
    } catch {
      recordFailedAttempt();
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLock = () => {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_TIME_KEY);
    setIsUnlocked(false);
    showNotification('Super-Admin locked.');
  };

  const handleNameChange = (val: string) => {
    setNewName(val);
    const slugified = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setNewSlug(slugified);
  };

  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newSlug.trim()) return;

    const isVendor = onboardBusinessType === 'vendor';
    const effectivePlan = isVendor ? 'vendor' : newPlan.toLowerCase();
    const effectiveServiceMode = isVendor ? 'counter_only' : 'table_service';

    const res = await registerRestaurant({
      name: newName.trim(),
      slug: newSlug.trim(),
      email: newEmail.trim() || `admin@${newSlug}.com`,
      password: newPassword,
      plan: effectivePlan,
      serviceMode: effectiveServiceMode,
      tableLimit: isVendor ? null : undefined,
    });

    if (res.success && res.restaurant) {
      showNotification(`🎉 Provisioned ${isVendor ? 'Street Vendor' : 'Restaurant'} "${res.restaurant.name}"!`);
      setIsOnboardModalOpen(false);
      setNewName('');
      setNewSlug('');
      setNewEmail('');
      setOnboardBusinessType('restaurant');
      loadAllTenants();
    } else {
      showNotification(res.error || 'Failed to provision restaurant');
    }
  };

  const handleUpdateTenantPlan = async (restaurantId: string, planId: string) => {
    const t = tenants.find(item => item.id === restaurantId);
    if (!t) return;
    const isVendor = planId === 'vendor' || planId === 'vendor-pro' || planId === 'vendor-monthly';
    const newServiceMode = isVendor ? 'counter_only' : 'table_service';
    const newTableLimit = isVendor ? null : (t.tableLimit ?? null);

    await updateRestaurantPlanInSupabase(restaurantId, planId, newTableLimit);
    await syncRestaurantMetaToSupabase(restaurantId, { serviceMode: newServiceMode, plan: planId });
    setTenants(prev => prev.map(item => item.id === restaurantId ? { 
      ...item, 
      plan: planId, 
      serviceMode: newServiceMode,
      tableLimit: newTableLimit,
      design: { ...(item.design || {}), serviceMode: newServiceMode, plan: planId } as typeof item.design
    } : item));
    showNotification(`Updated plan to ${planId.toUpperCase()} (${isVendor ? '⚡ Street Vendor' : '🍽️ Restaurant'}) for ${t.name}`);
  };

  const handleUpdateTenantCustomTableLimit = async (restaurantId: string, limitVal: number | null) => {
    const t = tenants.find(item => item.id === restaurantId);
    if (!t) return;
    await updateRestaurantPlanInSupabase(restaurantId, t.plan || 'basic', limitVal);
    setTenants(prev => prev.map(item => item.id === restaurantId ? { ...item, tableLimit: limitVal } : item));
    showNotification(limitVal ? `Custom table limit set to ${limitVal} for ${t.name}` : `Reset to plan default tables for ${t.name}`);
  };

  const handleToggleStatus = async (restaurantId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    await updateRestaurantStatusInSupabase(restaurantId, nextStatus);
    setTenants(prev => prev.map(t => t.id === restaurantId ? { ...t, status: nextStatus } : t));
    showNotification(`Restaurant status updated to ${nextStatus}`);
  };

  const handleInitiatePurge = (tenant: RestaurantTenant) => {
    setPurgeTarget(tenant);
    setPurgeInput('');
  };

  const handleConfirmPurge = async () => {
    if (!purgeTarget) return;
    const requiredPhrase = `DELETE ${purgeTarget.slug}`;
    if (purgeInput.trim() !== requiredPhrase) {
      showNotification(`Confirmation mismatch. You must type "${requiredPhrase}"`);
      return;
    }
    setIsPurging(true);
    try {
      await deleteRestaurantFromSupabase(purgeTarget.id);
      setTenants(prev => prev.filter(t => t.id !== purgeTarget.id));
      showNotification(`🚨 "${purgeTarget.name}" and owner credentials permanently purged.`);
      setPurgeTarget(null);
      setPurgeInput('');
    } catch {
      showNotification('Failed to purge restaurant.');
    } finally {
      setIsPurging(false);
    }
  };

  const handleUpdateCardOrderStatus = async (orderId: string, status: CardOrderRequest['status']) => {
    await updateCardOrderStatus(orderId, status);
    setCardOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    showNotification(`Card order marked ${status}`);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingContact(true);
    try {
      await savePlatformContactConfig(contactConfig);
      showNotification('🎉 WhatsApp contact settings saved! Live on homepage.');
    } catch (err) {
      showNotification('Failed to save WhatsApp settings.');
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleLoginAs = (tenant: RestaurantTenant) => {
    setActiveSession({
      userId: `admin-${tenant.id}`,
      email: tenant.ownerEmail || `admin@${tenant.slug}.com`,
      restaurantId: tenant.id,
      restaurantSlug: tenant.slug
    });
    showNotification(`Switched into ${tenant.name} dashboard`);
    window.location.href = '/';
  };

  const isVendorTenant = (t: RestaurantTenant) => {
    // If explicitly marked as table_service, it is ALWAYS a dine-in restaurant
    if (t.serviceMode === 'table_service') {
      return false;
    }
    const pl = (t.plan || (t.design as any)?.plan || '').toLowerCase();
    // If it has any dine-in plan, it is ALWAYS a dine-in restaurant, NEVER a street vendor
    if (pl.includes('basic') || pl.includes('standard') || pl.includes('premium') || pl.includes('enterprise') || pl.includes('growth')) {
      return false;
    }
    if (pl.includes('vendor')) {
      return true;
    }
    return t.serviceMode === 'counter_only' ||
      (t.design as any)?.serviceMode === 'counter_only' ||
      (t.design as any)?.plan === 'vendor';
  };

  const vendorCount = tenants.filter(isVendorTenant).length;
  const restaurantCount = tenants.filter(t => !isVendorTenant(t)).length;
  const pendingCacCount = tenants.filter(t => t.cacCertificateUrl && t.cacStatus !== 'verified').length;

  // Filtered tenants by search query & category filter (All, Restaurants, Vendors)
  const filteredTenants = tenants.filter(t => {
    if (cacFilterOnly && (!t.cacCertificateUrl || t.cacStatus === 'verified')) {
      return false;
    }
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || 
      t.name.toLowerCase().includes(query) ||
      t.slug.toLowerCase().includes(query) ||
      (t.ownerEmail || '').toLowerCase().includes(query);
    if (!matchesSearch) return false;
    if (categoryFilter === 'vendor') return isVendorTenant(t);
    if (categoryFilter === 'restaurant') return !isVendorTenant(t);
    return true;
  });

  // Platform Metrics
  const totalRestaurants = tenants.length;
  const totalTenants = tenants.length;
  const totalTables = tenants.filter(t => !isVendorTenant(t)).reduce((acc, t) => acc + (t.tables?.length || 0), 0);
  const totalDishes = tenants.reduce((acc, t) => 
    acc + t.pages.reduce((pAcc, p) => pAcc + p.items.length, 0), 0
  );
  // Dynamic plan pricing references
  const basicPrice = plans.find(p => p.id === 'basic')?.monthlyPrice || 8000;
  const standardPrice = plans.find(p => p.id === 'standard')?.monthlyPrice || 13000;
  const premiumPrice = plans.find(p => p.id === 'premium')?.monthlyPrice || 21000;
  const enterprisePrice = plans.find(p => p.id === 'enterprise')?.monthlyPrice || 35000;

  // Estimated MRR based on dynamically configured plans
  const estimatedMrr = tenants.reduce((acc, t) => {
    const pl = (t.plan || '').toLowerCase();
    if (pl === 'vendor-pro') return acc + 7500;
    if (pl === 'vendor' || pl === 'vendor-monthly' || t.serviceMode === 'counter_only') return acc + 4000;
    if (pl.includes('enterprise')) return acc + enterprisePrice;
    if (pl.includes('premium')) return acc + premiumPrice;
    if (pl.includes('standard') || pl.includes('growth')) return acc + standardPrice;
    return acc + basicPrice;
  }, 0);

  const handleUpdatePlan = (planId: string, updates: Partial<PlanTier>) => {
    setPlans(prev => {
      const updated = prev.map(p => p.id === planId ? { ...p, ...updates } : p);
      saveStoredPlans(updated);
      return updated;
    });
    setHasPlanChanges(true);
  };

  const handleUpdateVendorPlan = (planId: string, updates: Partial<PlanTier>) => {
    setVendorPlans(prev => {
      const updated = prev.map(p => p.id === planId ? { ...p, ...updates } : p);
      saveStoredVendorPlans(updated);
      return updated;
    });
    setHasPlanChanges(true);
  };

  const handleSavePlans = () => {
    saveStoredPlans(plans);
    saveStoredVendorPlans(vendorPlans);
    setHasPlanChanges(false);
    showNotification('🎉 Pricing plans saved! Live across all pages.');
  };

  const handleResetPlans = () => {
    const defaults = resetPlansToDefault();
    setPlans(defaults);
    setVendorPlans(getStoredVendorPlans());
    setHasPlanChanges(false);
    showNotification('Reset pricing plans to platform defaults.');
  };

  // If locked, render Secure Access Screen
  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4 font-sans select-none">
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl relative">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-extrabold text-white">Platform Super Admin</h1>
          <p className="text-xs text-neutral-400 mt-1 mb-5">
            Encrypted Administrative Master Control
          </p>

          {/* Auth Mode Toggle Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-950 border border-neutral-800 rounded-xl mb-5 text-xs font-bold">
            <button
              type="button"
              onClick={() => { setAuthMode('passcode'); setAuthError(null); }}
              className={`py-1.5 rounded-lg transition-colors ${
                authMode === 'passcode'
                  ? 'bg-amber-500 text-neutral-950 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Master Key
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('supabase'); setAuthError(null); }}
              className={`py-1.5 rounded-lg transition-colors ${
                authMode === 'supabase'
                  ? 'bg-amber-500 text-neutral-950 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Supabase Auth
            </button>
          </div>

          {/* Error / Lockout Alert */}
          {authError && (
            <div className="p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-left">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>Security Notice</span>
              </div>
              <div className="mt-1 text-[11px] leading-tight">
                {authError}
              </div>
            </div>
          )}

          {/* Form 1: Master Passcode */}
          {authMode === 'passcode' && (
            <form onSubmit={handlePasscodeUnlock} className="space-y-4">
              <div>
                <input
                  type="password"
                  required
                  autoFocus
                  disabled={lockoutSeconds > 0 || isAuthenticating}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Enter Master Security Key"
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-center text-sm font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <button
                type="submit"
                disabled={lockoutSeconds > 0 || isAuthenticating || !pinInput.trim()}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-xl text-xs transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAuthenticating ? 'Verifying Cryptographic Hash...' : lockoutSeconds > 0 ? `Locked (${lockoutSeconds}s)` : 'Verify Master Key'}
              </button>
            </form>
          )}

          {/* Form 2: Direct Supabase Admin Auth */}
          {authMode === 'supabase' && (
            <form onSubmit={handleSupabaseUnlock} className="space-y-3 text-left">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                  Admin Email
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  disabled={lockoutSeconds > 0 || isAuthenticating}
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@tm.tap"
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                  Admin Password
                </label>
                <input
                  type="password"
                  required
                  disabled={lockoutSeconds > 0 || isAuthenticating}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={lockoutSeconds > 0 || isAuthenticating || !adminEmail.trim() || !adminPassword}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-xl text-xs transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isAuthenticating ? 'Authenticating with Supabase...' : lockoutSeconds > 0 ? `Locked (${lockoutSeconds}s)` : 'Sign In via Supabase'}
              </button>
            </form>
          )}

          <div className="mt-5 pt-4 border-t border-neutral-800 text-[11px] text-neutral-500 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>SHA-256 Protected</span>
            </span>
            <a href="/" className="hover:text-neutral-300">
              ← Return Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-amber-400 selection:text-neutral-950">
      {/* Top Admin Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500 text-neutral-950 flex items-center justify-center font-serif font-black text-base sm:text-lg shadow-md shrink-0">
              T
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold text-xs sm:text-base text-white truncate">TapMenu Admin</span>
                <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[9px] sm:text-[10px] font-bold border border-amber-500/30 shrink-0">
                  Master
                </span>
              </div>
              <span className="text-[10px] sm:text-[11px] text-neutral-400 block -mt-0.5 truncate hidden sm:block">
                Multi-Tenant PostgreSQL & Hardware Management
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 text-xs shrink-0">
            <button
              onClick={handleLock}
              className="px-2.5 sm:px-3 py-1.5 text-neutral-400 hover:text-white transition-colors text-[11px]"
              title="Lock Admin Session"
            >
              Lock
            </button>
            <a
              href="/"
              className="px-2.5 sm:px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl transition-colors font-semibold text-[11px]"
            >
              Live Site
            </a>
            <button
              onClick={() => setIsOnboardModalOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-xl transition-all shadow-md active:scale-95 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Onboard Restaurant / Vendor</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content (with bottom padding on mobile for app tab bar) */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-5 sm:space-y-8 pb-28 md:pb-8">
        
        {/* KPI Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">
          <div className="bg-neutral-900 border border-neutral-800 p-3.5 sm:p-5 rounded-2xl">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
              Dine-In Restaurants
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-white mt-1 block">
              {restaurantCount}
            </span>
            <span className="text-[10px] sm:text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 shrink-0" /> Tables & KDS
            </span>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-3.5 sm:p-5 rounded-2xl">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" /> Street Vendors
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-300 mt-1 block">
              {vendorCount}
            </span>
            <span className="text-[10px] sm:text-[11px] text-neutral-400 mt-1 block truncate">
              Counter & Pickup
            </span>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-3.5 sm:p-5 rounded-2xl">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
              Total Table QR/NFCs
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-white mt-1 block">
              {totalTables}
            </span>
            <span className="text-[10px] sm:text-[11px] text-neutral-400 mt-1 block truncate">
              Active table points
            </span>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-3.5 sm:p-5 rounded-2xl">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
              Dishes Published
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-400 mt-1 block">
              {totalDishes}
            </span>
            <span className="text-[10px] sm:text-[11px] text-neutral-400 mt-1 block truncate">
              Live menu items
            </span>
          </div>

          <div className="col-span-2 lg:col-span-1 bg-neutral-900 border border-neutral-800 p-3.5 sm:p-5 rounded-2xl">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
              Estimated Monthly MRR
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 mt-1 block truncate">
              ₦{estimatedMrr.toLocaleString()}
            </span>
            <span className="text-[10px] sm:text-[11px] text-neutral-400 mt-1 block truncate">
              SaaS subscription pipeline
            </span>
          </div>
        </div>

        {/* Navigation Tabs (Desktop view) */}
        <div className="hidden md:flex items-center gap-2 border-b border-neutral-800 pb-3">
          <button
            onClick={() => setActiveTab('restaurants')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'restaurants'
                ? 'bg-amber-500 text-neutral-950 shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            All Accounts ({totalTenants})
          </button>
          <button
            onClick={() => setActiveTab('plans')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeTab === 'plans'
                ? 'bg-amber-500 text-neutral-950 shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Subscription Plans & Pricing (Editable)</span>
            {hasPlanChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'bg-amber-500 text-neutral-950 shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Homepage WhatsApp Chat</span>
          </button>
          <button
            onClick={() => setActiveTab('hardware')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'hardware'
                ? 'bg-amber-500 text-neutral-950 shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            Table Cards & Stands Fulfillment
          </button>
        </div>

        {/* TAB 1: ALL ACCOUNTS (RESTAURANTS & STREET VENDORS) */}
        {activeTab === 'restaurants' && (
          <div className="space-y-4">
            {/* Category Filter Pills & Search Bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 p-1 bg-neutral-900 border border-neutral-800 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setCategoryFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    categoryFilter === 'all'
                      ? 'bg-amber-500 text-neutral-950 shadow-sm'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  All ({totalTenants})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter('restaurant')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    categoryFilter === 'restaurant'
                      ? 'bg-amber-500 text-neutral-950 shadow-sm'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <Utensils className="w-3 h-3" />
                  <span>Restaurants ({restaurantCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter('vendor')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    categoryFilter === 'vendor'
                      ? 'bg-amber-500 text-neutral-950 shadow-sm'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  <span>Street Vendors ({vendorCount})</span>
                </button>

                {/* CAC Pending Filter */}
                <button
                  type="button"
                  onClick={() => setCacFilterOnly(f => !f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    cacFilterOnly
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>CAC Pending {pendingCacCount > 0 && `(${pendingCacCount})`}</span>
                </button>
              </div>

              {/* Search & Sync Bar */}
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by venue name, slug or email..."
                    className="w-full pl-10 pr-4 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <button
                  onClick={loadAllTenants}
                  disabled={loading}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl text-xs text-neutral-300 font-semibold transition-colors shrink-0"
                  title="Sync with Supabase"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
                  <span className="hidden sm:inline">Sync</span>
                </button>
              </div>
            </div>

            {/* Desktop Restaurants & Vendors Table */}
            <div className="hidden md:block bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-950/60 border-b border-neutral-800 text-neutral-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3.5 px-4">Venue / Brand</th>
                      <th className="py-3.5 px-4">Owner Email</th>
                      <th className="py-3.5 px-4">Slug & Live URL</th>
                      <th className="py-3.5 px-4">Plan</th>
                      <th className="py-3.5 px-4">Mode / Tables</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {filteredTenants.map((t) => {
                      const isVendor = isVendorTenant(t);
                      const dishCount = t.pages.reduce((sum, p) => sum + p.items.length, 0);
                      const customerUrl = `/?r=${t.slug}${isVendor ? '' : '&table=Table+1'}`;

                      return (
                        <tr key={t.id} className="hover:bg-neutral-800/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-neutral-800 border border-neutral-700 overflow-hidden flex items-center justify-center shrink-0">
                                {(() => {
                                  const safeLogo = sanitizeRestaurantLogo(t.logo, isVendor ? '⚡' : '🍽️');
                                  const isImg = safeLogo.startsWith('data:') || safeLogo.startsWith('http') || safeLogo.startsWith('/') || safeLogo.startsWith('blob:');
                                  return isImg ? (
                                    <img src={safeLogo} alt={t.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-base">{safeLogo}</span>
                                  );
                                })()}
                              </div>
                              <div>
                                <div className="font-bold text-white text-sm flex items-center gap-2">
                                  <span>{t.name}</span>
                                  {isVendor ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                      <Zap className="w-2.5 h-2.5" />
                                      Street Vendor
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
                                      Dine-In
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-neutral-400">{t.tagline || (isVendor ? 'Street Vendor / Stall' : 'Kitchen & Bar')}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-[11px]">
                            {/* Owner Email */}
                            {t.ownerEmail ? (
                              <a
                                href={`mailto:${t.ownerEmail}`}
                                className="text-amber-400 hover:underline flex items-center gap-1 truncate max-w-[160px]"
                                title={t.ownerEmail}
                              >
                                {t.ownerEmail}
                              </a>
                            ) : (
                              <span className="text-neutral-600 italic text-[10px]">No email on file</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 font-mono text-[11px]">
                            <a
                              href={customerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-amber-400 hover:underline flex items-center gap-1"
                            >
                              <span>/?r={t.slug}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex flex-col gap-1.5 min-w-[170px]">
                              {/* Plan Selector */}
                              <select
                                value={(t.plan || (isVendor ? 'vendor' : 'basic')).toLowerCase()}
                                onChange={(e) => handleUpdateTenantPlan(t.id, e.target.value)}
                                className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded-lg text-amber-300 font-bold text-[11px] focus:outline-none focus:border-amber-400 cursor-pointer"
                              >
                                <optgroup label="🍽️ Dine-In Plans">
                                  <option value="basic">Basic (10 tables - ₦8k/mo)</option>
                                  <option value="standard">Standard (20 tables - ₦19k/mo)</option>
                                  <option value="premium">Premium (60 tables - ₦30k/mo)</option>
                                  <option value="enterprise">Enterprise (Unlimited - ₦70k/mo)</option>
                                </optgroup>
                                <optgroup label="⚡ Street Vendor Plans">
                                  <option value="vendor">Vendor (Single Counter · ₦4,000/mo)</option>
                                  <option value="vendor-monthly">Vendor Monthly (₦4,000/mo)</option>
                                  <option value="vendor-pro">Vendor Pro (₦7,500/mo)</option>
                                </optgroup>
                              </select>

                              {/* Manual Custom Limit Override (Only for Dine-In) */}
                              {isVendor ? (
                                <span className="text-[10px] text-amber-400/80 font-medium flex items-center gap-1">
                                  <Zap className="w-2.5 h-2.5 text-amber-400" />
                                  Single Counter Walk-up
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                                  <span className="shrink-0">Limit override:</span>
                                  <input
                                    type="number"
                                    min={1}
                                    placeholder="Auto"
                                    value={t.tableLimit ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10));
                                      handleUpdateTenantCustomTableLimit(t.id, val);
                                    }}
                                    className="w-14 px-1.5 py-0.5 bg-neutral-950 border border-neutral-700 rounded text-center text-white text-[10px] focus:outline-none focus:border-amber-400"
                                    title="Leave empty to use plan default, or enter specific max tables"
                                  />
                                  {t.tableLimit !== undefined && t.tableLimit !== null && (
                                    <span className="text-amber-400 font-bold text-[9px]">(custom)</span>
                                  )}
                                </div>
                              )}

                              {/* Plan Expiry Date & Timer */}
                              <div className="pt-1.5 border-t border-neutral-800/80 flex flex-col gap-1">
                                <div className="flex items-center justify-between text-[10px] text-neutral-400">
                                  <span>Plan Expiry:</span>
                                  {t.subscriptionExpiresAt && (() => {
                                    const dLeft = Math.ceil((new Date(t.subscriptionExpiresAt).getTime() - Date.now()) / 86400000);
                                    return (
                                      <span className={`font-bold ${
                                        dLeft <= 0 ? 'text-red-400' : dLeft <= 5 ? 'text-orange-400' : 'text-emerald-400'
                                      }`}>
                                        {dLeft <= 0 ? '⛔ Expired' : dLeft <= 5 ? `⚠️ ${dLeft}d left` : `✅ ${dLeft}d left`}
                                      </span>
                                    );
                                  })()}
                                </div>
                                <input
                                  type="date"
                                  value={t.subscriptionExpiresAt ? t.subscriptionExpiresAt.slice(0, 10) : ''}
                                  onChange={async (e) => {
                                    const val = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                                    await syncRestaurantMetaToSupabase(t.id, { subscriptionExpiresAt: val });
                                    setTenants(prev => prev.map(item => item.id === t.id ? { ...item, subscriptionExpiresAt: val } : item));
                                    showNotification(`Updated plan expiry for ${t.name}`);
                                  }}
                                  className="w-full px-2 py-0.5 bg-neutral-950 border border-neutral-750 rounded text-amber-300 font-mono text-[10px] focus:outline-none focus:border-amber-400 cursor-pointer"
                                  title="Edit plan expiry date"
                                />
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-neutral-300 text-[11px]">
                            {isVendor ? (
                              <div>
                                <div className="font-bold text-amber-300 flex items-center gap-1">
                                  <Zap className="w-3 h-3 text-amber-400" />
                                  <span>Walk-up Counter</span>
                                </div>
                                <div className="text-[10px] text-neutral-400 mt-0.5">
                                  {dishCount} menu items &middot; No tables
                                </div>
                              </div>
                            ) : (
                              <div>
                                <span className="font-bold text-white">{t.tables?.length || 0}</span>
                                <span className="text-neutral-500"> / </span>
                                <span className="text-amber-300 font-semibold">
                                  {t.tableLimit !== undefined && t.tableLimit !== null
                                    ? `${t.tableLimit} max`
                                    : (() => {
                                        const pl = (t.plan || 'basic').toLowerCase();
                                        if (pl.includes('enterprise')) return '∞';
                                        if (pl.includes('premium')) return '60 max';
                                        if (pl.includes('standard') || pl.includes('growth')) return '20 max';
                                        return '10 max';
                                      })()
                                  }
                                </span>
                                <span className="text-neutral-400 ml-1">tables</span>
                                <div className="text-[10px] text-neutral-400 mt-0.5">
                                  {dishCount} dishes
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <button
                              onClick={() => handleToggleStatus(t.id, t.status)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                t.status === 'active'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                  : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                              <span>{t.status === 'active' ? 'Active' : 'Suspended'}</span>
                            </button>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleToggleStatus(t.id, t.status)}
                                className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer ${
                                  t.status === 'suspended'
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                    : 'bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30'
                                }`}
                                title={t.status === 'suspended' ? 'Resume services' : 'Pause/suspend services'}
                              >
                                {t.status === 'suspended' ? (
                                  <><Play className="w-3 h-3" /> Resume</>
                                ) : (
                                  <><Pause className="w-3 h-3" /> Pause</>
                                )}
                              </button>

                              <button
                                onClick={() => {
                                  setQrModalTenant(t);
                                  setSelectedTableIdx(0);
                                }}
                                className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                                title="View and download QR codes and customer links"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                                <span>QR & Links</span>
                              </button>

                              {/* CAC Review button — only shown if tenant has uploaded a CAC doc */}
                              {t.cacCertificateUrl && (
                                <button
                                  onClick={() => setViewingCacModal({ url: t.cacCertificateUrl!, tenantName: t.name, tenantId: t.id, status: t.cacStatus || 'pending' })}
                                  className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer border ${
                                    t.cacStatus === 'verified'
                                      ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                      : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30'
                                  }`}
                                  title="Review CAC registration document"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>{t.cacStatus === 'verified' ? '✓ CAC' : '⏳ CAC'}</span>
                                </button>
                              )}

                              <button
                                onClick={() => handleLoginAs(t)}
                                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg font-bold text-[11px] transition-colors"
                                title="Login and manage this venue's menu"
                              >
                                Manage
                              </button>

                              <button
                                onClick={() => handleInitiatePurge(t)}
                                className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                title="Purge venue and credentials"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredTenants.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-neutral-500">
                          No matching venues found in Supabase database.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Restaurant & Vendor Cards List */}
            <div className="space-y-3.5 md:hidden">
              {filteredTenants.map((t) => {
                const isVendor = isVendorTenant(t);
                const dishCount = t.pages.reduce((sum, p) => sum + p.items.length, 0);
                const customerUrl = `/?r=${t.slug}${isVendor ? '' : '&table=Table+1'}`;

                return (
                  <div key={t.id} className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4 shadow-md space-y-3">
                    {/* Header: Logo, Name, Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 overflow-hidden flex items-center justify-center shrink-0">
                          {(() => {
                            const safeLogo = sanitizeRestaurantLogo(t.logo, isVendor ? '⚡' : '🍽️');
                            const isImg = safeLogo.startsWith('data:') || safeLogo.startsWith('http') || safeLogo.startsWith('/') || safeLogo.startsWith('blob:');
                            return isImg ? (
                              <img src={safeLogo} alt={t.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xl">{safeLogo}</span>
                            );
                          })()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-white text-sm truncate">{t.name}</h4>
                            {isVendor ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                                <Zap className="w-2.5 h-2.5" />
                                Vendor
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700 shrink-0">
                                Dine-In
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-400 truncate">{t.tagline || (isVendor ? 'Street Vendor / Stall' : 'Kitchen & Bar')}</p>
                          {t.ownerEmail && (
                            <p className="text-[10px] text-amber-400/80 font-mono truncate mt-0.5">{t.ownerEmail}</p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleStatus(t.id, t.status)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors shrink-0 ${
                          t.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                        <span>{t.status === 'active' ? 'Active' : 'Suspended'}</span>
                      </button>
                    </div>

                    {/* Live URL Link & Table/Dish Counts */}
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-neutral-800/80">
                      <a
                        href={customerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-400 hover:underline flex items-center gap-1 font-mono text-[11px] truncate max-w-[50%]"
                      >
                        <span className="truncate">/?r={t.slug}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>

                      {isVendor ? (
                        <div className="font-mono text-[11px] text-amber-300 font-semibold shrink-0 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>Walk-up Counter &middot; {dishCount} dishes</span>
                        </div>
                      ) : (
                        <div className="font-mono text-[11px] text-neutral-300 shrink-0">
                          <span className="font-bold text-white">{t.tables?.length || 0}</span>
                          <span className="text-neutral-500">/</span>
                          <span className="text-amber-300 font-semibold">
                            {t.tableLimit !== undefined && t.tableLimit !== null
                              ? `${t.tableLimit}`
                              : (() => {
                                  const pl = (t.plan || 'basic').toLowerCase();
                                  if (pl.includes('enterprise')) return '∞';
                                  if (pl.includes('premium')) return '60';
                                  if (pl.includes('standard') || pl.includes('growth')) return '20';
                                  return '10';
                                })()
                            }
                          </span>
                          <span className="text-neutral-400 ml-1">tbls</span>
                          <span className="text-neutral-500 mx-1">·</span>
                          <span className="text-neutral-400">{dishCount} dishes</span>
                        </div>
                      )}
                    </div>

                    {/* Plan & Limit Overrides */}
                    <div className="bg-neutral-950/70 rounded-xl p-2.5 border border-neutral-800 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Plan</label>
                        <select
                          value={(t.plan || (isVendor ? 'vendor' : 'basic')).toLowerCase()}
                          onChange={(e) => handleUpdateTenantPlan(t.id, e.target.value)}
                          className="px-2.5 py-1 bg-neutral-900 border border-neutral-700 rounded-lg text-amber-300 font-bold text-xs focus:outline-none focus:border-amber-400 cursor-pointer"
                        >
                          <optgroup label="🍽️ Dine-In Plans">
                            <option value="basic">Basic (10 tables)</option>
                            <option value="standard">Standard (20 tables)</option>
                            <option value="premium">Premium (60 tables)</option>
                            <option value="enterprise">Enterprise (Unlimited)</option>
                          </optgroup>
                          <optgroup label="⚡ Street Vendor Plans">
                            <option value="vendor">Vendor (Single Counter · ₦4,000)</option>
                            <option value="vendor-monthly">Vendor Monthly (₦4,000)</option>
                            <option value="vendor-pro">Vendor Pro (₦7,500)</option>
                          </optgroup>
                        </select>
                      </div>

                      {!isVendor ? (
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Table Limit Override</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              placeholder="Auto"
                              value={t.tableLimit ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10));
                                handleUpdateTenantCustomTableLimit(t.id, val);
                              }}
                              className="w-16 px-2 py-1 bg-neutral-900 border border-neutral-700 rounded-lg text-center text-white text-xs focus:outline-none focus:border-amber-400"
                            />
                            {t.tableLimit !== undefined && t.tableLimit !== null && (
                              <span className="text-amber-400 font-bold text-[10px]">(custom)</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-amber-400/80 font-medium flex items-center gap-1 pt-0.5">
                          <Zap className="w-2.5 h-2.5 text-amber-400" />
                          <span>Single Counter Mode &middot; Dine-in table limits disabled</span>
                        </div>
                      )}

                      {/* Plan Expiry */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-800">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Expires</label>
                          {t.subscriptionExpiresAt && (() => {
                            const dLeft = Math.ceil((new Date(t.subscriptionExpiresAt).getTime() - Date.now()) / 86400000);
                            return (
                              <span className={`text-[9px] font-bold ${
                                dLeft <= 0 ? 'text-red-400' : dLeft <= 5 ? 'text-orange-400' : 'text-emerald-400'
                              }`}>
                                ({dLeft <= 0 ? 'Expired' : `${dLeft}d left`})
                              </span>
                            );
                          })()}
                        </div>
                        <input
                          type="date"
                          value={t.subscriptionExpiresAt ? t.subscriptionExpiresAt.slice(0, 10) : ''}
                          onChange={async (e) => {
                            const val = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                            await syncRestaurantMetaToSupabase(t.id, { subscriptionExpiresAt: val });
                            setTenants(prev => prev.map(item => item.id === t.id ? { ...item, subscriptionExpiresAt: val } : item));
                            showNotification(`Updated plan expiry for ${t.name}`);
                          }}
                          className="px-2 py-0.5 bg-neutral-900 border border-neutral-700 rounded text-amber-300 font-mono text-xs focus:outline-none focus:border-amber-400 cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleToggleStatus(t.id, t.status)}
                        className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                          t.status === 'suspended'
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-orange-600/20 text-orange-400 border border-orange-500/30'
                        }`}
                        title={t.status === 'suspended' ? 'Resume services' : 'Pause services'}
                      >
                        {t.status === 'suspended' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                        <span>{t.status === 'suspended' ? 'Resume' : 'Pause'}</span>
                      </button>

                      <button
                        onClick={() => {
                          setQrModalTenant(t);
                          setSelectedTableIdx(0);
                        }}
                        className="py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>QR & Links</span>
                      </button>
                      <button
                        onClick={() => handleLoginAs(t)}
                        className="flex-1 py-2 px-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow"
                      >
                        <Store className="w-3.5 h-3.5 text-amber-400" />
                        <span>Manage Venue</span>
                      </button>
                      <button
                        onClick={() => handleInitiatePurge(t)}
                        className="p-2 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl border border-neutral-800 transition-colors"
                        title="Purge venue"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredTenants.length === 0 && (
                <div className="py-8 text-center text-neutral-500 bg-neutral-900 rounded-2xl border border-neutral-800 text-xs">
                  No matching restaurants found in Supabase database.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: HARDWARE FULFILLMENT */}
        {activeTab === 'hardware' && (
          <div className="space-y-6">
            <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6">
              <h3 className="text-base font-bold text-white mb-2">Digital Cards & Table Stand Logistics</h3>
              <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
                Physical hardware fulfillment generates immediate upfront revenue on every table deployment in Nigeria. 
                Average production cost is ₦1,600 per card, charged at ₦7,000 per card (generating ₦5,400 net profit per table setup).
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-xs">Plain White Digital Card</span>
                    <span className="font-mono text-amber-400 font-bold">₦7,000 / card</span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    High-grade waterproof digital card with scannable QR. Cost: ₦1,600 &middot; <strong className="text-emerald-400">₦5,400 profit per table</strong>.
                  </p>
                </div>

                <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-xs">Custom Logo / Branded Card</span>
                    <span className="font-mono text-amber-400 font-bold">₦11,000 / card</span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    ₦7k base + ₦4k custom full-color logo / restaurant artwork UV printing. <strong className="text-emerald-400">₦7,500+ profit per table</strong>.
                  </p>
                </div>

                <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-xs">Heavy Clear Acrylic Stand</span>
                    <span className="font-mono text-amber-400 font-bold">₦3,500 / stand</span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    Crystal-clear tabletop display standee holds the smart card upright and spill-proof for high-turn dining tables.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: HOMEPAGE WHATSAPP & CONTACT SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 flex items-center justify-center text-[#25D366]">
                      <MessageCircle className="w-4 h-4" />
                    </div>
                    <span>Homepage WhatsApp Chat Bubble Configuration</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Control the floating WhatsApp contact bubble in the bottom right corner of the TapMenu homepage for customer inquiries & onboardings.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveContact} className="space-y-5 max-w-2xl">
                <div>
                  <label className="block text-xs font-bold text-neutral-200 mb-1 flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[#25D366]" />
                    <span>WhatsApp Phone Number (International Format) *</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={contactConfig.whatsappNumber}
                    onChange={(e) => setContactConfig(prev => ({ ...prev, whatsappNumber: e.target.value }))}
                    placeholder="e.g. 2348000000000 or +234 800 000 0000"
                    className="w-full px-4 py-3 bg-neutral-950 border border-neutral-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-[#25D366] focus:ring-1 focus:ring-[#25D366] transition-colors"
                  />
                  <p className="text-[11px] text-neutral-400 mt-1.5 leading-relaxed">
                    Enter the phone number with country code. Symbols will be cleaned automatically. Examples: <span className="font-mono text-amber-300">2348012345678</span> (Nigeria), <span className="font-mono text-amber-300">14155551234</span> (USA), <span className="font-mono text-amber-300">447123456789</span> (UK).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-200 mb-1 flex items-center gap-2">
                    <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                    <span>Default Chat Welcome Message *</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={contactConfig.whatsappMessage}
                    onChange={(e) => setContactConfig(prev => ({ ...prev, whatsappMessage: e.target.value }))}
                    placeholder="Hello TapMenu Team! I'd like to learn more about digital menus for my restaurant."
                    className="w-full px-4 py-3 bg-neutral-950 border border-neutral-700 rounded-xl text-white text-xs leading-relaxed focus:outline-none focus:border-[#25D366] focus:ring-1 focus:ring-[#25D366] transition-colors"
                  />
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Pre-filled message when the visitor taps the chat bubble on the landing page.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-200 mb-1">
                    Support Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={contactConfig.supportEmail || ''}
                    onChange={(e) => setContactConfig(prev => ({ ...prev, supportEmail: e.target.value }))}
                    placeholder="support@tapmenu.me"
                    className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </div>

                {/* Live Preview & Direct Test Card */}
                <div className="p-4 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-neutral-300">
                    <span>Live Interactive Chat Bubble Preview</span>
                    <span className="text-[11px] text-emerald-400 font-mono">Status: Connected</span>
                  </div>

                  <div className="flex items-center gap-3.5 p-3 bg-neutral-900 rounded-xl border border-neutral-800">
                    <div className="w-12 h-12 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-lg shrink-0">
                      <MessageCircle className="w-6 h-6 fill-current" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>WhatsApp Chat Link</span>
                        <span className="font-mono text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                          +{contactConfig.whatsappNumber.replace(/[^0-9]/g, '') || '2348000000000'}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                        "{contactConfig.whatsappMessage}"
                      </p>
                    </div>

                    <a
                      href={`https://wa.me/${contactConfig.whatsappNumber.replace(/[^0-9]/g, '') || '2348000000000'}?text=${encodeURIComponent(contactConfig.whatsappMessage)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 border border-neutral-700"
                    >
                      <span>Test Link</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSavingContact}
                    className="px-6 py-3 bg-[#25D366] hover:bg-[#20ba59] text-neutral-950 font-black rounded-xl text-xs transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingContact ? 'Saving Settings...' : 'Save WhatsApp Settings'}</span>
                  </button>
                  <a
                    href="/"
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5"
                  >
                    <span>View Live on Homepage</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: SUBSCRIPTION PLANS & PRICING EDITOR */}
        {activeTab === 'plans' && (
          <div className="space-y-6">
            <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-amber-400" />
                    <span>Live Subscription Plans & Table Limits (Nigeria)</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Edit monthly rates, annual rates, and table allocations. Changes reflect on the public <a href="/?page=pricing" target="_blank" rel="noreferrer" className="text-amber-400 underline">Pricing Page</a> immediately.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleResetPlans}
                    className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Defaults</span>
                  </button>
                  <button
                    onClick={handleSavePlans}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-xl text-xs transition-colors shadow-md"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Pricing Changes</span>
                  </button>
                </div>
              </div>

              {/* 4 Editable Plan Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {plans.map((p) => (
                  <div
                    key={p.id}
                    className={`p-4 rounded-2xl border flex flex-col justify-between ${
                      p.id === 'standard'
                        ? 'bg-neutral-950/90 border-amber-500/60 shadow-lg'
                        : 'bg-neutral-950 border-neutral-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-serif font-bold text-sm text-white">{p.name}</span>
                        {p.badge && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                            {p.badge}
                          </span>
                        )}
                      </div>

                      {/* Monthly Rate Input */}
                      <div className="mb-3">
                        <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                          Monthly Price (₦)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-neutral-500 text-xs font-bold">₦</span>
                          <input
                            type="number"
                            step={500}
                            value={p.monthlyPrice}
                            onChange={(e) => handleUpdatePlan(p.id, { monthlyPrice: Number(e.target.value) })}
                            className="w-full pl-7 pr-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-400"
                          />
                        </div>
                      </div>

                      {/* Annual Rate Input */}
                      <div className="mb-3">
                        <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                          Annual Price (₦)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-neutral-500 text-xs font-bold">₦</span>
                          <input
                            type="number"
                            step={5000}
                            value={p.annualPrice}
                            onChange={(e) => handleUpdatePlan(p.id, { annualPrice: Number(e.target.value) })}
                            className="w-full pl-7 pr-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-400"
                          />
                        </div>
                      </div>

                      {/* Annual Incentive Perk */}
                      <div className="mb-3">
                        <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                          🎁 Annual Incentive Perk
                        </label>
                        <input
                          type="text"
                          value={p.annualIncentive || ''}
                          placeholder="e.g. Save ₦26k (2 Mos Free) + 5 Free Smart Cards"
                          onChange={(e) => handleUpdatePlan(p.id, { annualIncentive: e.target.value })}
                          className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      {/* Max Tables Input */}
                      <div className="mb-3">
                        <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                          Max Tables Allocation
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            value={p.maxTables ?? 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              handleUpdatePlan(p.id, { maxTables: val <= 0 ? null : val });
                            }}
                            disabled={p.id === 'enterprise'}
                            placeholder="Unlimited"
                            className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-400 disabled:opacity-50"
                          />
                          <span className="text-[11px] text-neutral-400 shrink-0 font-medium">
                            {p.maxTables ? 'Tables' : 'Unlimited'}
                          </span>
                        </div>
                      </div>

                      {/* Subtitle / Tagline */}
                      <div className="mb-3">
                        <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                          Target Audience Tagline
                        </label>
                        <textarea
                          rows={2}
                          value={p.tagline}
                          onChange={(e) => handleUpdatePlan(p.id, { tagline: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded-xl text-[11px] text-neutral-300 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-neutral-800 text-[10px] text-neutral-400">
                      ✓ {p.features.length} core features included
                    </div>
                  </div>
                ))}
              </div>

              {/* Street Vendor Subscription Plans */}
              <div className="mt-8 pt-6 border-t border-neutral-800">
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>Street Vendor Plans (Counter & Pop-Up Stalls)</span>
                  </h4>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Pricing for single-counter, walk-up vendors (no dine-in table system).
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vendorPlans.map((vp) => (
                    <div
                      key={vp.id}
                      className="p-4 rounded-2xl border bg-neutral-950 border-neutral-800 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-serif font-bold text-sm text-white">{vp.name}</span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                            {vp.badge || 'Street Vendor'}
                          </span>
                        </div>

                        {/* Monthly Rate Input */}
                        <div className="mb-3">
                          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                            Monthly Price (₦)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-neutral-500 text-xs font-bold">₦</span>
                            <input
                              type="number"
                              step={500}
                              value={vp.monthlyPrice}
                              onChange={(e) => handleUpdateVendorPlan(vp.id, { monthlyPrice: Number(e.target.value) })}
                              className="w-full pl-7 pr-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-400"
                            />
                          </div>
                        </div>

                        {/* Annual Rate Input */}
                        <div className="mb-3">
                          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                            Annual Price (₦)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-neutral-500 text-xs font-bold">₦</span>
                            <input
                              type="number"
                              step={5000}
                              value={vp.annualPrice}
                              onChange={(e) => handleUpdateVendorPlan(vp.id, { annualPrice: Number(e.target.value) })}
                              className="w-full pl-7 pr-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-400"
                            />
                          </div>
                        </div>

                        {/* Annual Incentive Perk */}
                        <div className="mb-3">
                          <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                            🎁 Annual Incentive Perk
                          </label>
                          <input
                            type="text"
                            value={vp.annualIncentive || ''}
                            placeholder="e.g. Save ₦8,000 (2 Mos Free) + 2 Free NFC Counter Stands"
                            onChange={(e) => handleUpdateVendorPlan(vp.id, { annualIncentive: e.target.value })}
                            className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        {/* Subtitle / Tagline */}
                        <div className="mb-3">
                          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                            Target Audience Tagline
                          </label>
                          <textarea
                            rows={2}
                            value={vp.tagline}
                            onChange={(e) => handleUpdateVendorPlan(vp.id, { tagline: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded-xl text-[11px] text-neutral-300 focus:outline-none focus:border-amber-400"
                          />
                        </div>
                      </div>

                      <div className="pt-3 border-t border-neutral-800 text-[10px] text-amber-400 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        <span>Single Counter Walk-up &middot; {vp.features.length} core features included</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {hasPlanChanges && (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-300">
                  <span>You have unsaved pricing modifications!</span>
                  <button
                    onClick={handleSavePlans}
                    className="px-3 py-1 bg-amber-500 text-neutral-950 font-bold rounded-lg"
                  >
                    Save Changes Now
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: SMART CARDS HARDWARE ORDERS (₦7,000 / Card) */}
        {/* ========================================================= */}
        {activeTab === 'hardware' && (
          <div className="space-y-4">
            <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-extrabold text-white">Smart NFC Cards Hardware Requests</h3>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Incoming hardware orders from kitchens (@ ₦7,000 / custom card). Contact the restaurant via WhatsApp or phone to confirm payment and dispatch shipment.
                </p>
              </div>

              <div className="px-3.5 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl font-mono text-xs font-bold text-amber-300">
                {cardOrders.filter(o => o.status === 'pending').length} Pending Orders
              </div>
            </div>

            {/* Orders List */}
            {cardOrders.length === 0 ? (
              <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-12 text-center text-neutral-400 space-y-2">
                <Package className="w-10 h-10 text-neutral-600 mx-auto" />
                <h4 className="font-bold text-white text-sm">No Hardware Orders Received Yet</h4>
                <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                  When restaurants click "Order Cards" in their kitchen dashboard, their custom card requests and contact details will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {cardOrders.map(order => {
                  const cleanPhone = order.contactPhone.replace(/[^0-9]/g, '');
                  const waMsg = `Hello ${order.restaurantName}! This is TapMenu Super Admin regarding your order for ${order.quantity} Smart Cards (₦${order.totalAmount.toLocaleString()}). Let's verify your payment and delivery address.`;
                  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMsg)}`;

                  return (
                    <div
                      key={order.id}
                      className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4 sm:p-5 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-white">#{order.id}</span>
                          <span className="font-bold text-sm text-amber-400">{order.restaurantName}</span>
                          <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase ${
                            order.status === 'fulfilled'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : order.status === 'contacted'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                          }`}>
                            {order.status}
                          </span>
                        </div>

                        <div className="text-xs text-neutral-300 space-y-1">
                          <div>
                            <strong>Function: </strong> 
                            <span className="capitalize">{order.cardType.replace('_', ' ')}</span>
                            {order.tableNumbers && <span className="text-amber-300 font-mono ml-1.5">({order.tableNumbers})</span>}
                            {order.targetUrlPayload && <span className="text-neutral-400 ml-1.5">({order.targetUrlPayload})</span>}
                          </div>
                          <div>
                            <strong>Order Size: </strong>
                            <span className="font-mono font-bold">{order.quantity} Cards</span> @ ₦{order.unitPrice.toLocaleString()} = <span className="text-emerald-400 font-mono font-extrabold text-sm">₦{order.totalAmount.toLocaleString()} NGN</span>
                          </div>
                          {order.notes && (
                            <div className="text-[11px] text-neutral-400 italic">
                              Notes: {order.notes}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Admin Actions */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>WhatsApp ({order.contactPhone})</span>
                        </a>

                        {order.status === 'pending' && (
                          <button
                            onClick={() => handleUpdateCardOrderStatus(order.id, 'contacted')}
                            className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold rounded-xl text-xs border border-neutral-700 transition-colors"
                          >
                            Mark Contacted
                          </button>
                        )}

                        {order.status !== 'fulfilled' && (
                          <button
                            onClick={() => handleUpdateCardOrderStatus(order.id, 'fulfilled')}
                            className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 font-bold rounded-xl text-xs border border-emerald-500/30 transition-colors"
                          >
                            Mark Fulfilled
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Required Typing Confirmation Modal for Permanent Purge */}
      {purgeTarget && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-red-500/40 rounded-3xl max-w-md w-full p-6 text-white space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">Permanently Purge Restaurant?</h3>
                <p className="text-xs text-red-400 font-medium">Irreversible database & auth credential destruction</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              This will completely erase <strong>"{purgeTarget.name}"</strong> (slug: <code className="text-amber-400 font-mono font-bold">/{purgeTarget.slug}</code>), all menu items, dishes, shift logs, orders, and purge their owner login from Supabase Auth.
            </p>

            <div className="space-y-1.5 p-3.5 bg-neutral-950 rounded-2xl border border-neutral-800">
              <label className="block text-[11px] text-neutral-400 font-bold">
                To confirm, type <span className="text-red-400 font-mono font-black select-all">DELETE {purgeTarget.slug}</span> below:
              </label>
              <input
                type="text"
                autoFocus
                value={purgeInput}
                onChange={(e) => setPurgeInput(e.target.value)}
                placeholder={`DELETE ${purgeTarget.slug}`}
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPurgeTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 font-bold text-xs hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={purgeInput.trim() !== `DELETE ${purgeTarget.slug}` || isPurging}
                onClick={handleConfirmPurge}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-lg disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isPurging ? 'Purging...' : 'Permanently Purge & Delete User'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALWAYS-VISIBLE MOBILE FLOATING ACTION BUTTON */}
      <div className="fixed bottom-20 right-4 z-40 md:hidden">
        <button
          type="button"
          onClick={() => setIsOnboardModalOpen(true)}
          className="flex items-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-full shadow-2xl shadow-amber-500/40 active:scale-95 border border-amber-300 transition-all cursor-pointer"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span className="text-xs font-bold uppercase tracking-wide">Onboard</span>
        </button>
      </div>

      {/* MOBILE APP-STYLE BOTTOM NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/95 backdrop-blur-xl border-t border-neutral-800 md:hidden px-3 py-2 flex items-center justify-around safe-bottom shadow-2xl">
        <button
          type="button"
          onClick={() => setActiveTab('restaurants')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
            activeTab === 'restaurants' ? 'text-amber-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Building2 className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Venues ({totalRestaurants})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('plans')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all relative cursor-pointer ${
            activeTab === 'plans' ? 'text-amber-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <CreditCard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Plans & Pricing</span>
          {hasPlanChanges && (
            <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
            activeTab === 'settings' ? 'text-amber-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <MessageCircle className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">WhatsApp</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hardware')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
            activeTab === 'hardware' ? 'text-amber-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Package className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Cards</span>
        </button>
      </nav>

      {/* MODAL: Onboard Venue or Street Vendor */}
      {isOnboardModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-white">Provision New Account</h3>
              <button
                type="button"
                onClick={() => setIsOnboardModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-neutral-400 mb-4">
              Instantly provisions a cloud database row, private dashboard, and public flipbook URL.
            </p>

            {/* Account Type Toggle: Restaurant vs Street Vendor */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-950 border border-neutral-800 rounded-2xl mb-4">
              <button
                type="button"
                onClick={() => {
                  setOnboardBusinessType('restaurant');
                  setNewPlan('Standard');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  onboardBusinessType === 'restaurant'
                    ? 'bg-amber-500 text-neutral-950 shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Utensils className="w-3.5 h-3.5" />
                <span>Restaurant</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOnboardBusinessType('vendor');
                  setNewPlan('Vendor');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  onboardBusinessType === 'vendor'
                    ? 'bg-amber-500 text-neutral-950 shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Street Vendor</span>
              </button>
            </div>

            <form onSubmit={handleCreateRestaurant} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-neutral-300 mb-1">
                  {onboardBusinessType === 'vendor' ? 'Vendor / Brand Name *' : 'Restaurant Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={onboardBusinessType === 'vendor' ? 'e.g. Iya Basira Suya, Mama Put Kitchen' : 'e.g. Suya Kingdom, Lekki Bistro'}
                  className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-300 mb-1">Menu URL Slug *</label>
                <div className="flex items-center px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl font-mono text-neutral-400">
                  <span>tapmenu.com/?r=</span>
                  <input
                    type="text"
                    required
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ''))}
                    className="w-full bg-transparent text-white font-bold focus:outline-none ml-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Subscription Plan</label>
                  {onboardBusinessType === 'vendor' ? (
                    <select
                      value={newPlan}
                      onChange={(e) => setNewPlan(e.target.value as any)}
                      className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-amber-300 font-bold focus:outline-none"
                    >
                      <option value="Vendor">Vendor Monthly (Single Counter · ₦4,000/mo)</option>
                    </select>
                  ) : (
                    <select
                      value={newPlan}
                      onChange={(e) => setNewPlan(e.target.value as any)}
                      className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:outline-none"
                    >
                      <option value="Basic">Basic (10 tables - ₦8k/mo)</option>
                      <option value="Standard">Standard (20 tables - ₦19k/mo)</option>
                      <option value="Premium">Premium (60 tables - ₦30k/mo)</option>
                      <option value="Enterprise">Enterprise (Unlimited - ₦70k/mo)</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Owner Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder={onboardBusinessType === 'vendor' ? 'vendor@gmail.com' : 'manager@restaurant.com'}
                    className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsOnboardModalOpen(false)}
                  className="px-4 py-2 text-neutral-400 hover:text-white rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-xl transition-colors shadow-md flex items-center gap-1.5"
                >
                  {onboardBusinessType === 'vendor' ? (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Provision Street Vendor</span>
                    </>
                  ) : (
                    <>
                      <Utensils className="w-4 h-4" />
                      <span>Provision Restaurant</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Ergonomic Notched Floating Bottom Navigation Bar */}
      <NotchedBottomBar
        variant="super_admin"
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenOnboardModal={() => setIsOnboardModalOpen(true)}
        totalRestaurants={totalRestaurants}
        hasPlanChanges={hasPlanChanges}
        onLockSession={handleLock}
      />
      {/* ── CAC Review Modal ── */}
      {viewingCacModal && (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4" onClick={() => setViewingCacModal(null)}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">CAC Document Review</p>
                <h3 className="text-white font-bold text-sm mt-0.5">{viewingCacModal.tenantName}</h3>
              </div>
              <button onClick={() => setViewingCacModal(null)} className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={viewingCacModal.url}
              alt="CAC Certificate"
              className="w-full max-h-80 object-contain rounded-xl border border-neutral-700 bg-neutral-950"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await syncRestaurantMetaToSupabase(viewingCacModal.tenantId, { cacStatus: 'verified' });
                  setTenants(prev => prev.map(t => t.id === viewingCacModal.tenantId ? { ...t, cacStatus: 'verified' } : t));
                  showNotification('CAC marked as verified ✓');
                  setViewingCacModal(null);
                }}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                ✓ Mark Verified
              </button>
              <button
                type="button"
                onClick={async () => {
                  await syncRestaurantMetaToSupabase(viewingCacModal.tenantId, { cacStatus: 'rejected' });
                  setTenants(prev => prev.map(t => t.id === viewingCacModal.tenantId ? { ...t, cacStatus: 'rejected' } : t));
                  showNotification('CAC marked as rejected');
                  setViewingCacModal(null);
                }}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                ✗ Reject
              </button>
              <a
                href={viewingCacModal.url}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                Open Full
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin QR & Links Popup Modal ── */}
      {qrModalTenant && (() => {
        const isVendorModal = isVendorTenant(qrModalTenant);
        const primaryMenuUrl = getAbsoluteVendorUrl(qrModalTenant.slug);

        const downloadTableQr = async (url: string, label: string) => {
          try {
            const dataUrl = await generateHighResQrDataUrl(url, 1024);
            if (!dataUrl) throw new Error('QR generation failed');
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `${qrModalTenant.slug}-${label.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showNotification(`QR for ${label} downloaded (High-Res 1024px)!`);
          } catch (err) {
            console.error('QR download failed:', err);
          }
        };

        const rawTables = qrModalTenant.tables || [];
        const tables = !isVendorModal && rawTables.length === 0
          ? [1, 2, 3, 4, 5].map(num => ({
              id: `tbl-${qrModalTenant.id}-${num}`,
              tableNumber: `Table ${num}`,
              label: `Table ${num}`,
              section: 'Dining Area',
              ntagSerial: `04:FA:${num.toString().padStart(2, '0')}:88:22:90:${num.toString().padStart(2, '0')}`,
              nfcStatus: 'active' as const,
              totalTaps: 0,
              totalScans: 0,
              urlPayload: getAbsoluteTableUrl(qrModalTenant.slug, `Table ${num}`)
            }))
          : rawTables;

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-750 w-full max-w-2xl rounded-3xl p-5 shadow-2xl space-y-4 text-xs max-h-[90vh] overflow-y-auto">

              {/* Header */}
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-sm sm:text-base">{qrModalTenant.name}</h3>
                    <p className="text-[11px] text-neutral-400 font-mono">
                      slug: {qrModalTenant.slug} · {isVendorModal ? '⚡ Street Vendor' : '🍽️ Restaurant'}
                      {!isVendorModal && tables.length > 0 && ` · ${tables.length} tables`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setQrModalTenant(null)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Primary menu link row (always shown) */}
              <div className="space-y-1">
                <label className="font-bold text-neutral-400 uppercase tracking-wider text-[10px]">Primary Menu Link</label>
                <div className="flex items-center gap-2 p-2 bg-neutral-950 rounded-xl border border-neutral-800">
                  <span className="font-mono text-amber-300 text-xs truncate flex-1">{primaryMenuUrl}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(primaryMenuUrl);
                      showNotification('Menu link copied!');
                    }}
                    className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-bold text-[11px] shrink-0 cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* VENDOR: single counter QR */}
              {isVendorModal && (
                <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-2xl border border-neutral-200 shadow-inner">
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">⚡ Single Counter Walk-up QR</span>
                  <LocalQrImage
                    url={primaryMenuUrl}
                    alt="Counter QR"
                    className="w-44 h-44 rounded-lg object-contain"
                  />
                  <span className="text-[10px] text-neutral-500 font-mono">Scan to open digital menu</span>
                  <button
                    type="button"
                    onClick={() => downloadTableQr(primaryMenuUrl, 'counter')}
                    className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-white font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    Download Counter QR (PNG)
                  </button>
                </div>
              )}

              {/* RESTAURANT: per-table QR grid */}
              {!isVendorModal && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-neutral-400 uppercase tracking-wider text-[10px]">
                      {tables.length > 0 ? `Per-Table QR Codes (${tables.length} tables)` : 'Table QR Codes'}
                    </label>
                    {tables.length > 1 && (
                      <button
                        type="button"
                        onClick={async () => {
                          showNotification(`Starting download for all ${tables.length} tables...`);
                          for (const tbl of tables) {
                            const tableUrl = getAbsoluteTableUrl(qrModalTenant.slug, tbl.tableNumber);
                            await downloadTableQr(tableUrl, tbl.tableNumber);
                            await new Promise(r => setTimeout(r, 400));
                          }
                        }}
                        className="text-amber-400 hover:text-amber-300 font-bold text-[10px] flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download All ({tables.length})</span>
                      </button>
                    )}
                  </div>

                  {tables.length === 0 ? (
                    <div className="text-neutral-500 text-center py-6 bg-neutral-950 rounded-2xl border border-neutral-800">
                      No tables configured yet. Add tables in the restaurant settings.
                    </div>
                  ) : (
                    <>
                      {/* Full grid: one QR card per table — all visible at once */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {tables.map((tbl) => {
                          const tableUrl = getAbsoluteTableUrl(qrModalTenant.slug, tbl.tableNumber);
                          return (
                            <div
                              key={tbl.id}
                              className="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl border border-neutral-200 shadow-sm"
                            >
                              <span className="text-[10px] font-extrabold text-neutral-800 uppercase tracking-widest">{tbl.tableNumber}</span>
                              <LocalQrImage
                                url={tableUrl}
                                alt={`QR for ${tbl.tableNumber}`}
                                className="w-28 h-28 rounded-lg object-contain"
                              />
                              <span className="text-[9px] text-neutral-400 font-mono break-all text-center leading-tight">{tableUrl}</span>
                              <div className="flex items-center gap-1.5 w-full">
                                <button
                                  type="button"
                                  onClick={() => downloadTableQr(tableUrl, tbl.tableNumber)}
                                  className="flex-1 py-1.5 bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer text-[10px]"
                                  title={`Download high-res QR for ${tbl.tableNumber}`}
                                >
                                  <Download className="w-3 h-3 text-amber-400" />
                                  PNG
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(tableUrl);
                                    showNotification(`${tbl.tableNumber} link copied!`);
                                  }}
                                  className="flex-1 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-bold rounded-lg text-[10px] cursor-pointer"
                                >
                                  Copy
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* CAC Certificate Verification in Admin Popup */}
              {qrModalTenant.cacCertificateUrl && (
                <div className="p-3 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">CAC Registration Document</span>
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      qrModalTenant.cacStatus === 'verified'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      Status: {qrModalTenant.cacStatus || 'pending'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <img src={qrModalTenant.cacCertificateUrl} alt="CAC" className="w-14 h-14 object-cover rounded-lg border border-neutral-700" />
                    <div className="flex items-center gap-2 flex-1">
                      <button
                        type="button"
                        onClick={async () => {
                          await syncRestaurantMetaToSupabase(qrModalTenant.id, { cacStatus: 'verified' });
                          setTenants(prev => prev.map(t => t.id === qrModalTenant.id ? { ...t, cacStatus: 'verified' } : t));
                          qrModalTenant.cacStatus = 'verified';
                          showNotification('CAC marked verified!');
                        }}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs cursor-pointer"
                      >
                        ✓ Verify CAC
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await syncRestaurantMetaToSupabase(qrModalTenant.id, { cacStatus: 'rejected' });
                          setTenants(prev => prev.map(t => t.id === qrModalTenant.id ? { ...t, cacStatus: 'rejected' } : t));
                          qrModalTenant.cacStatus = 'rejected';
                          showNotification('CAC marked rejected');
                        }}
                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setQrModalTenant(null)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
