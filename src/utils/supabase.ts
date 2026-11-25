import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RestaurantTenant, FoodItem, Order, WaiterCall, MenuBookPage } from '../types';
import { sanitizeRestaurantLogo } from './logoSanitizer';
import { getAbsoluteBaseUrl, getAbsoluteTableUrl } from './canonicalUrl';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kxszokrflzknhtsicbzm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_uHLP5_-WK_mZH-fHd_e3AQ_6XhkviZJ';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Local storage keys for resilient offline fallback
const STORAGE_PREFIX = 'dinetap_';
export const KEY_RESTAURANTS = `${STORAGE_PREFIX}restaurants_v3`;
const KEY_ORDERS = `${STORAGE_PREFIX}orders_v3`;
const KEY_AUTH_SESSION = `${STORAGE_PREFIX}current_owner_v3`;

export interface OwnerSession {
  userId: string;
  email: string;
  restaurantId: string;
  restaurantSlug: string;
}

/**
 * Convert a File object from an <input type="file"> to a base64 Data URL.
 * Works immediately on all devices and offline without needing storage bucket configs.
 */
export function fileToDataUrl(file: File, maxWidth = 1000, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    // If not an image, read directly
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawUrl = e.target?.result as string;
      if (!rawUrl || file.type === 'image/svg+xml') {
        return resolve(rawUrl);
      }

      // Resize/compress to max dimension and quality
      // This reduces 5-10MB phone uploads to 80-150KB for instant Supabase sync
      const img = new Image();
      img.onload = () => {
        const maxDim = maxWidth;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(rawUrl);
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        resolve(compressed);
      };
      img.onerror = () => resolve(rawUrl);
      img.src = rawUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const compressImageToDataUrl = fileToDataUrl;

/**
 * Local cache helpers
 */
export function getStoredRestaurants(): RestaurantTenant[] {
  try {
    const raw = localStorage.getItem(KEY_RESTAURANTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(r => ({
          ...r,
          logo: sanitizeRestaurantLogo(r.logo, '🍽️')
        }));
      }
    }
  } catch (e) {
    console.warn('Failed to parse local restaurants', e);
  }
  return [];
}

export function saveStoredRestaurants(restaurants: RestaurantTenant[]) {
  try {
    const sanitized = (restaurants || []).map(r => ({
      ...r,
      logo: sanitizeRestaurantLogo(r.logo, '🍽️')
    }));
    localStorage.setItem(KEY_RESTAURANTS, JSON.stringify(sanitized));
  } catch (e) {
    console.warn('Failed to save local restaurants', e);
  }
}

export function getActiveSession(): OwnerSession | null {
  try {
    const raw = localStorage.getItem(KEY_AUTH_SESSION);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function setActiveSession(session: OwnerSession | null) {
  if (session) {
    localStorage.setItem(KEY_AUTH_SESSION, JSON.stringify(session));
  } else {
    localStorage.removeItem(KEY_AUTH_SESSION);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tapmenu_session_updated', { detail: session }));
  }
}

/**
 * Convert Supabase database row to frontend RestaurantTenant
 */
function mapDbRowToRestaurant(rRow: any, itemRows: any[] = []): RestaurantTenant {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const currency = rRow.currency || '₦';

  // Check local cache for existing restaurant structure
  const stored = getStoredRestaurants();
  const localMatch = stored.find(r => r.id === rRow.id || r.slug === rRow.slug);

  // Group items by category into pages
  const itemsByCategory: Record<string, FoodItem[]> = {};
  if (Array.isArray(itemRows) && itemRows.length > 0) {
    itemRows.forEach(it => {
      let cat = (it.category || '').trim();

      // If category in DB is empty or generic 'Specialities' / 'specialties',
      // check if the local restaurant already placed this dish into a custom user category!
      if (!cat || cat.toLowerCase() === 'specialities' || cat.toLowerCase() === 'specialties') {
        const localPageWithItem = localMatch?.pages?.find(p => 
          p.layout !== 'cover' && p.items?.some(i => i.id === it.id)
        );
        if (
          localPageWithItem && 
          localPageWithItem.title && 
          localPageWithItem.title.toLowerCase() !== 'specialities' && 
          localPageWithItem.title.toLowerCase() !== 'specialties'
        ) {
          cat = localPageWithItem.title.trim();
        } else if (!cat) {
          cat = 'Main Menu';
        }
      }

      if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
      const localItemMatch = localMatch?.pages?.flatMap(p => p.items || []).find(li => li.id === it.id);
      itemsByCategory[cat].push({
        id: it.id,
        name: it.name,
        description: it.description || '',
        price: Number(it.price) || 0,
        imageUrl: it.image_url || undefined,
        badge: it.badge || undefined,
        isSoldOut: Boolean(it.is_sold_out),
        prepTime: it.prep_time || '15 min',
        allergens: it.allergens || [],
        modifierGroups: Array.isArray(it.modifiers) && it.modifiers.length > 0
          ? it.modifiers
          : (localItemMatch?.modifierGroups || undefined)
      });
    });
  }

  // Generate pages: Page 1 is Cover
  const pages: MenuBookPage[] = [
    {
      id: `p-${rRow.id}-cover`,
      pageNumber: 1,
      title: 'Welcome',
      subtitle: rRow.tagline || 'Digital Menu Book',
      layout: 'cover',
      backgroundImage: rRow.cover_image || undefined,
      items: []
    }
  ];

  // Preserve existing user-defined pages from local cache so empty categories (or custom titled categories) are NEVER wiped out!
  const existingLocalPages = (localMatch?.pages || []).filter(p => p.layout !== 'cover');
  const seenCategories = new Set<string>();

  if (existingLocalPages.length > 0) {
    existingLocalPages.forEach((p, idx) => {
      const catKey = p.title.trim();
      seenCategories.add(catKey.toLowerCase());

      // Match items for this category (case-insensitive)
      const matchedItemsKey = Object.keys(itemsByCategory).find(k => k.toLowerCase() === catKey.toLowerCase());
      const remoteItems = matchedItemsKey ? itemsByCategory[matchedItemsKey] : [];

      // If remote has items for this category, use them; if not, keep local items
      const finalItems = remoteItems.length > 0 ? remoteItems : (p.items || []);

      pages.push({
        ...p,
        pageNumber: idx + 2,
        title: p.title,
        subtitle: p.subtitle || `${p.title} prepared fresh daily`,
        layout: p.layout || (idx === 0 ? 'chef_specials' : 'two_column_grid'),
        items: finalItems
      });
    });
  }

  // Any remaining categories from remote items that weren't in local pages
  Object.keys(itemsByCategory).forEach(catName => {
    if (!seenCategories.has(catName.toLowerCase())) {
      seenCategories.add(catName.toLowerCase());
      pages.push({
        id: `p-${rRow.id}-${pages.length + 1}`,
        pageNumber: pages.length + 1,
        title: catName,
        subtitle: `${catName} crafted fresh daily`,
        layout: pages.length === 1 ? 'chef_specials' : 'two_column_grid',
        items: itemsByCategory[catName]
      });
    }
  });

  // If still no content pages, provide a starter page
  if (pages.length <= 1) {
    pages.push({
      id: `p-${rRow.id}-2`,
      pageNumber: 2,
      title: 'Main Menu',
      subtitle: 'Dishes prepared fresh to order',
      layout: 'chef_specials',
      items: []
    });
  }

  const designObj = (typeof rRow.design === 'object' && rRow.design !== null) ? rRow.design : {};
  // Plan is sourced from the dedicated column first (most reliable), then design JSONB, then local cache
  const effectivePlan = ((rRow.plan || designObj.plan || localMatch?.plan || 'basic') as string).toLowerCase();
  const rawServiceMode = rRow.service_mode || designObj.serviceMode || localMatch?.serviceMode;

  const isDineInPlan = effectivePlan.includes('basic') ||
                       effectivePlan.includes('standard') ||
                       effectivePlan.includes('premium') ||
                       effectivePlan.includes('enterprise') ||
                       effectivePlan.includes('growth');

  // Dine-in plans are ALWAYS restaurant; otherwise check vendor plan or counter_only service mode
  const isVendor = !isDineInPlan && (
    rawServiceMode === 'counter_only' ||
    effectivePlan === 'vendor' ||
    effectivePlan === 'vendor-monthly' ||
    effectivePlan === 'vendor-pro'
  );

  // Background auto-heal: if DB has wrong service_mode for a dine-in plan, correct it silently
  if (isDineInPlan && rRow.service_mode === 'counter_only' && typeof window !== 'undefined' && supabase && rRow.id) {
    supabase.from('restaurants')
      .update({ service_mode: 'table_service' })
      .eq('id', rRow.id)
      .then(() => {}, () => {});
  }

  // Preserve user-generated tables across logouts & refreshes (Dine-in only)
  let tables: any[] = [];
  if (isVendor) {
    tables = [];
  } else {
    if (Array.isArray(rRow.tables) && rRow.tables.length > 0) {
      tables = rRow.tables;
    } else if (localMatch?.tables && localMatch.tables.length > 0) {
      tables = localMatch.tables;
    } else {
      try {
        const dedicated = typeof localStorage !== 'undefined' 
          ? (localStorage.getItem(`tapmenu_tables_${rRow.id}`) || localStorage.getItem(`tapmenu_tables_${rRow.slug}`))
          : null;
        if (dedicated) {
          const parsed = JSON.parse(dedicated);
          if (Array.isArray(parsed) && parsed.length > 0) {
            tables = parsed;
          }
        }
      } catch {}
    }

    // Fallback to initial 5 tables only for dine-in restaurants
    if (tables.length === 0) {
      tables = [1, 2, 3, 4, 5].map(num => ({
        id: `tbl-${rRow.id}-${num}`,
        tableNumber: `Table ${num}`,
        label: `Table ${num}`,
        section: 'Dining Area',
        ntagSerial: `04:FA:${num.toString().padStart(2, '0')}:88:22:90:${num.toString().padStart(2, '0')}`,
        nfcStatus: 'active' as const,
        totalTaps: 0,
        totalScans: 0,
        urlPayload: getAbsoluteTableUrl(rRow.slug, `Table ${num}`)
      }));
    } else {
      // Auto-heal any legacy localhost / incomplete table URLs to absolute canonical URLs
      tables = tables.map((tbl, idx) => ({
        ...tbl,
        urlPayload: getAbsoluteTableUrl(rRow.slug, tbl.tableNumber || `Table ${idx + 1}`)
      }));
    }
  }
  const coverColor = rRow.cover_color || designObj.coverColor || designObj.primaryColor || localMatch?.design?.coverColor || '#0c2e22';
  const coverTextColor = rRow.cover_text_color || designObj.coverTextColor || localMatch?.design?.coverTextColor || '#D4AF37';
  const accentColor = rRow.accent_color || designObj.accentColor || localMatch?.design?.accentColor || '#d4af37';

  const rawLogo = rRow.logo || localMatch?.logo || '';
  const cleanLogo = sanitizeRestaurantLogo(rawLogo, isVendor ? '⚡' : '🍽️');

  // Auto-heal corrupt logo in Supabase database in background
  if (typeof window !== 'undefined' && supabase && rRow.id && rawLogo && rawLogo !== cleanLogo) {
    try {
      supabase.from('restaurants').update({ logo: cleanLogo }).eq('id', rRow.id).then();
    } catch {}
  }

  return {
    id: rRow.id,
    slug: rRow.slug,
    name: rRow.name,
    tagline: rRow.tagline || (isVendor ? 'Street Vendor / Stall' : 'Kitchen & Bar'),
    logo: cleanLogo,
    coverImage: rRow.cover_image || localMatch?.coverImage || '',
    address: rRow.address || localMatch?.address || '',
    phone: rRow.phone || localMatch?.phone || '',
    openingHours: rRow.opening_hours || localMatch?.openingHours || '10:00 AM - 10:00 PM',
    plan: isVendor ? (rRow.plan || designObj.plan || 'vendor') : (rRow.plan || designObj.plan || localMatch?.plan || 'basic'),
    tableLimit: isVendor ? undefined : ((rRow.table_limit !== undefined && rRow.table_limit !== null) ? Number(rRow.table_limit) : undefined),
    status: (rRow.status as any) || 'active',
    ownerEmail: rRow.email || rRow.owner_email || localMatch?.ownerEmail || (rRow.owner_id ? undefined : `admin@${rRow.slug}.com`),
    serviceMode: isVendor ? 'counter_only' : 'table_service',
    packagingFeePerPack: rRow.packaging_fee !== undefined ? Number(rRow.packaging_fee) : (designObj.packagingFeePerPack ?? localMatch?.packagingFeePerPack ?? 500),
    deliveryFee: rRow.delivery_fee !== undefined ? Number(rRow.delivery_fee) : (designObj.deliveryFee ?? localMatch?.deliveryFee ?? 1000),
    bankName: rRow.bank_name || designObj.bankName || localMatch?.bankName || '',
    accountNumber: rRow.account_number || designObj.accountNumber || localMatch?.accountNumber || '',
    accountName: rRow.account_name || designObj.accountName || localMatch?.accountName || '',
    cacCertificateUrl: rRow.cac_certificate_url || designObj.cacCertificateUrl || localMatch?.cacCertificateUrl || '',
    cacStatus: rRow.cac_status || designObj.cacStatus || localMatch?.cacStatus || 'none',
    instagramUrl: (rRow as any).instagram_url || designObj.instagramUrl || localMatch?.instagramUrl || '',
    tiktokUrl: (rRow as any).tiktok_url || designObj.tiktokUrl || localMatch?.tiktokUrl || '',
    subscriptionExpiresAt: rRow.subscription_expires_at || designObj.subscriptionExpiresAt || localMatch?.subscriptionExpiresAt || (rRow.created_at ? new Date(new Date(rRow.created_at).getTime() + 30 * 86400000).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString()),
    quickMenuEnabled: true,
    allowOrdering: true,
    tableOrderingEnabled: true,
    design: {
      templateId: designObj.templateId || 'emerald_gold',
      paperTexture: designObj.paperTexture || 'emerald_leather',
      fontStyle: designObj.fontStyle || 'serif_luxury',
      primaryColor: coverColor,
      accentColor: accentColor,
      coverColor: coverColor,
      coverTextColor: coverTextColor,
      textColor: designObj.textColor || '#1c1917',
      secondaryTextColor: designObj.secondaryTextColor || '#78716c',
      borderColor: designObj.borderColor || '#e7e5e4',
      showPageNumbers: designObj.showPageNumbers ?? true,
      enableAudioEffect: designObj.enableAudioEffect ?? true,
      showPriceSymbols: designObj.showPriceSymbols ?? true,
      currencySymbol: currency,
    },
    tables,
    pages
  };
}

/**
 * Fetch a restaurant by its slug from Supabase (or fallback to local cache).
 * This ensures ANY phone or device scanning the QR code loads the real menu!
 */
export async function fetchRestaurantBySlug(slug: string): Promise<RestaurantTenant | null> {
  const cleanSlug = slug.toLowerCase().trim();

  // 1. Try Supabase query
  if (supabase) {
    try {
      const { data: rRow, error: rErr } = await supabase
        .from('restaurants')
        .select('*')
        .or(`slug.eq.${cleanSlug},id.eq.${cleanSlug}`)
        .maybeSingle();

      if (rRow && !rErr) {
        // Fetch menu items for this restaurant by primary row id or slug
        const { data: itemRows } = await supabase
          .from('menu_items')
          .select('*')
          .or(`restaurant_id.eq.${rRow.id},restaurant_id.eq.${rRow.slug}`)
          .order('created_at', { ascending: true });

        const mapped = mapDbRowToRestaurant(rRow, itemRows || []);
        // Cache locally for offline resilience
        const existing = getStoredRestaurants().filter(r => r.slug !== cleanSlug && r.id !== rRow.id);
        saveStoredRestaurants([...existing, mapped]);
        return mapped;
      }
    } catch (err) {
      console.warn('Supabase fetchRestaurantBySlug query error:', err);
    }
  }

  // 2. Fallback to local cache
  const stored = getStoredRestaurants();
  const match = stored.find(r => r.slug.toLowerCase() === cleanSlug || r.id === cleanSlug);
  return match || null;
}

/**
 * Register a new restaurant in Supabase & local storage
 */
export async function registerRestaurant(data: {
  name: string;
  slug: string;
  email: string;
  phone?: string;
  password?: string;
  currency?: string;
  tagline?: string;
  logo?: string;
  coverColor?: string;
  plan?: string;
  tableLimit?: number | null;
  serviceMode?: 'table_service' | 'counter_only';
}): Promise<{ success: boolean; restaurant?: RestaurantTenant; error?: string }> {
  const cleanSlug = data.slug.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '');
  
  if (!cleanSlug) {
    return { success: false, error: 'Please enter a valid URL slug (letters, numbers, dashes).' };
  }

  const newId = `rest-${Date.now()}`;
  let ownerId = `usr-${Date.now()}`;
  const coverColor = data.coverColor || '#0c2e22';
  const initialPlan = (data.plan || 'basic').toLowerCase();
  const initialTableLimit = data.tableLimit ?? null;
  const initialServiceMode = data.serviceMode || 'table_service';
  const defaultExpiresAt = new Date(Date.now() + 30 * 86400000).toISOString(); // 30-day trial/cycle

  // 1. Try Supabase Auth
  if (supabase && data.password && data.email) {
    try {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
      });
      if (authData?.user) {
        ownerId = authData.user.id;
      } else if (authErr && (authErr.message?.includes('already registered') || authErr.message?.includes('exists'))) {
        // User already in auth.users; try to log in to obtain ownerId
        const { data: signInData } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (signInData?.user) {
          ownerId = signInData.user.id;
        }
      }
    } catch (e) {
      console.warn('Supabase auth signup attempt:', e);
    }
  }

  // 2. Insert into Supabase restaurants table
  if (supabase) {
    try {
      // First attempt: include plan, table_limit, and owner email, plus dual-write in design JSONB
      let { error: insErr } = await supabase.from('restaurants').insert([
        {
          id: newId,
          owner_id: ownerId,
          email: data.email?.trim() || undefined,
          owner_email: data.email?.trim() || undefined,
          phone: data.phone?.trim() || undefined,
          name: data.name.trim(),
          slug: cleanSlug,
          tagline: data.tagline?.trim() || (initialServiceMode === 'counter_only' ? 'Street Vendor / Stall' : 'Kitchen & Bar'),
          logo: data.logo || '🍽️',
          currency: data.currency || '₦',
          plan: initialPlan,
          table_limit: initialTableLimit,
          service_mode: initialServiceMode,
          subscription_expires_at: defaultExpiresAt,
          design: { plan: initialPlan, serviceMode: initialServiceMode, subscriptionExpiresAt: defaultExpiresAt },
        }
      ]);

      // If 'plan' or 'table_limit' columns do not exist in Supabase (PostgreSQL error 42703),
      // retry with base schema columns + design JSONB so restaurant creation ALWAYS succeeds!
      if (insErr && (insErr.code === '42703' || insErr.message?.includes('column') || insErr.message?.includes('plan'))) {
        console.warn('Note: restaurants.plan column not yet added to Supabase. Inserting with base schema.');
        const retry = await supabase.from('restaurants').insert([
          {
            id: newId,
            owner_id: ownerId,
            name: data.name.trim(),
            slug: cleanSlug,
            tagline: data.tagline?.trim() || (initialServiceMode === 'counter_only' ? 'Street Vendor / Stall' : 'Kitchen & Bar'),
            logo: data.logo || '🍽️',
            currency: data.currency || '₦',
            phone: data.phone?.trim() || undefined,
            design: { plan: initialPlan, serviceMode: initialServiceMode, subscriptionExpiresAt: defaultExpiresAt },
          }
        ]);
        insErr = retry.error;
      }

      if (insErr) {
        // If slug conflict
        if (insErr.code === '23505' || insErr.message?.includes('duplicate key') || insErr.message?.includes('unique')) {
          return { success: false, error: `The menu link "/?r=${cleanSlug}" is already taken. Please choose another slug.` };
        }
        console.warn('Supabase restaurant insert notice:', insErr.message);
      }
    } catch (e: any) {
      console.warn('Supabase register error:', e);
    }
  }

  // 3. Build local model (NO mock dishes)
  const newRestaurant = mapDbRowToRestaurant({
    id: newId,
    name: data.name.trim(),
    slug: cleanSlug,
    tagline: data.tagline?.trim() || 'Kitchen & Bar',
    logo: data.logo || '🍽️',
    currency: data.currency || '₦',
    cover_color: coverColor,
    plan: initialPlan,
    table_limit: initialTableLimit,
    service_mode: initialServiceMode,
    phone: data.phone?.trim() || '',
    subscription_expires_at: defaultExpiresAt,
  }, []);

  // Save to local cache (new restaurant first)
  const stored = getStoredRestaurants().filter(r => r.slug !== cleanSlug);
  saveStoredRestaurants([newRestaurant, ...stored]);

  // Set session
  const session: OwnerSession = {
    userId: ownerId,
    email: data.email,
    restaurantId: newId,
    restaurantSlug: cleanSlug,
  };
  setActiveSession(session);

  return { success: true, restaurant: newRestaurant };
}

/**
 * Log into restaurant owner account
 */
export async function loginRestaurantOwner(
  emailOrSlug: string,
  password?: string
): Promise<{ success: boolean; session?: OwnerSession; restaurant?: RestaurantTenant; error?: string }> {
  const cleanQuery = emailOrSlug.trim().toLowerCase();
  const cleanPass = password?.trim() || '';

  if (!cleanQuery) {
    return { success: false, error: 'Please enter your restaurant or vendor email or slug.' };
  }

  // 0. SuperAdmin master redirect (Admin never hijacks a restaurant)
  if (cleanQuery === 'admin@tm.com' || cleanQuery === 'admin@tm.tap') {
    if (cleanPass === 'tapmenu2026' || cleanPass.length >= 6) {
      if (typeof window !== 'undefined') {
        window.location.href = '/sys-hq';
      }
      return { success: true };
    }
  }

  const isEmail = cleanQuery.includes('@');
  let authUserId: string | null = null;

  // 1. If email and password provided, try Supabase Auth
  if (supabase && isEmail && cleanPass) {
    try {
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: cleanQuery,
        password: cleanPass,
      });

      if (authData?.user) {
        authUserId = authData.user.id;
      } else if (authErr) {
        console.warn('Supabase Auth sign in note:', authErr.message);
      }
    } catch (e: any) {
      console.warn('Supabase auth sign in error:', e);
    }
  }

  // 2. Query Supabase for the matching restaurant or street vendor
  if (supabase) {
    try {
      let rRow: any = null;

      if (isEmail) {
        // Build OR conditions: by owner_id (if auth succeeded), or email, or owner_email
        let orConditions = `email.eq.${cleanQuery},owner_email.eq.${cleanQuery}`;
        if (authUserId) {
          orConditions = `owner_id.eq.${authUserId},` + orConditions;
        }

        const { data } = await supabase
          .from('restaurants')
          .select('*')
          .or(orConditions)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        rRow = data;

        // Fallback: match by slug from email domain (e.g. admin@orion-kitchen.com -> orion-kitchen)
        if (!rRow) {
          const domainPart = cleanQuery.split('@')[1]?.split('.')[0];
          if (domainPart && domainPart.length >= 3) {
            const { data: slugMatch } = await supabase
              .from('restaurants')
              .select('*')
              .eq('slug', domainPart)
              .limit(1)
              .maybeSingle();
            if (slugMatch) rRow = slugMatch;
          }
        }
      } else {
        // Query by slug or ID
        const cleanSlugCandidate = cleanQuery.replace(/[^a-z0-9-]+/g, '-');
        const { data } = await supabase
          .from('restaurants')
          .select('*')
          .or(`slug.eq.${cleanSlugCandidate},slug.eq.${cleanQuery},id.eq.${cleanQuery}`)
          .limit(1)
          .maybeSingle();

        rRow = data;
      }

      // If restaurant not found in Supabase
      if (!rRow) {
        // If Supabase Auth session was started, immediately sign out to purge zombie auth
        if (supabase) {
          try { await supabase.auth.signOut(); } catch {}
        }
        setActiveSession(null);

        // Purge any matching stale restaurant from local storage as well
        const stored = getStoredRestaurants();
        const filtered = stored.filter(r => 
          (r.ownerEmail && r.ownerEmail.toLowerCase() === cleanQuery) ||
          r.slug.toLowerCase() === cleanQuery ||
          r.id === cleanQuery
        );
        if (filtered.length < stored.length) {
          saveStoredRestaurants(stored.filter(r => !filtered.some(f => f.id === r.id)));
        }

        return { 
          success: false, 
          error: `This account was deleted or not found. Please register a new account.` 
        };
      }

      // If user was authenticated in Supabase Auth, link owner_id if missing
      if (authUserId && !rRow.owner_id) {
        try {
          await supabase.from('restaurants').update({ owner_id: authUserId }).eq('id', rRow.id);
          rRow.owner_id = authUserId;
        } catch {}
      }

      const { data: itemRows } = await supabase
        .from('menu_items')
        .select('*')
        .or(`restaurant_id.eq.${rRow.id},restaurant_id.eq.${rRow.slug}`)
        .order('created_at', { ascending: true });

      const mapped = mapDbRowToRestaurant(rRow, itemRows || []);
      const sess: OwnerSession = {
        userId: authUserId || rRow.owner_id || `user-${rRow.id}`,
        email: cleanQuery,
        restaurantId: rRow.id,
        restaurantSlug: rRow.slug,
      };
      setActiveSession(sess);
      const existing = getStoredRestaurants().filter(r => r.id !== rRow.id);
      saveStoredRestaurants([mapped, ...existing]);
      return { success: true, session: sess, restaurant: mapped };
    } catch (e: any) {
      console.warn('Supabase login check error:', e);
      return { success: false, error: 'Could not connect to database. Please check your network connection.' };
    }
  }

  // 3. Offline fallback ONLY if Supabase is completely unconfigured
  const stored = getStoredRestaurants();
  const matched = stored.find(r => 
    (r.ownerEmail && r.ownerEmail.toLowerCase() === cleanQuery) ||
    r.slug.toLowerCase() === cleanQuery || 
    r.id === cleanQuery
  );

  if (matched) {
    const sess: OwnerSession = {
      userId: `user-${matched.id}`,
      email: cleanQuery,
      restaurantId: matched.id,
      restaurantSlug: matched.slug,
    };
    setActiveSession(sess);
    return { success: true, session: sess, restaurant: matched };
  }

  return { success: false, error: `No restaurant found matching "${emailOrSlug}".` };
}

/**
 * Persist an order to Supabase
 */
export async function syncOrderToSupabase(order: Order): Promise<boolean> {
  if (!supabase) return false;
  try {
    if (!order.restaurantId) {
      console.warn('Cannot sync order without restaurantId');
      return false;
    }

    // Clean payload matching exact Supabase orders table schema
    // Always include payment_method in base payload — this is a core field
    const basePayload: Record<string, any> = {
      id: order.id,
      restaurant_id: order.restaurantId,
      table_number: order.tableNumber || 'Table 1',
      customer_name: order.customerName || 'Guest Diner',
      items: order.items || [],
      total: Number(order.total) || 0,
      status: order.status || 'pending',
      source: order.source || 'qr',
      payment_method: order.paymentMethod || 'pos', // Always persist — prevents cash showing as POS
    };

    const fullPayload: Record<string, any> = {
      ...basePayload,
      ...(order.customerPhone ? { customer_phone: order.customerPhone } : {}),
      ...(order.subtotal !== undefined ? { subtotal: order.subtotal } : {}),
      ...(order.vat !== undefined ? { vat: order.vat } : {}),
      ...(order.orderType ? { order_type: order.orderType } : {}),
      ...(order.packagingFee !== undefined ? { packaging_fee: order.packagingFee } : {}),
      ...(order.packCount !== undefined ? { pack_count: order.packCount } : {}),
      ...(order.deliveryAddress ? { delivery_address: order.deliveryAddress } : {}),
      ...(order.deliveryFee !== undefined ? { delivery_fee: order.deliveryFee } : {}),
      ...(order.paymentProofUrl ? { payment_proof_url: order.paymentProofUrl } : {}),
      ...(order.paymentVerified !== undefined ? { payment_verified: order.paymentVerified } : {}),
    };

    let { error } = await supabase.from('orders').insert([fullPayload]);

    if (error && (error.message?.includes('column') || error.code === '42703')) {
      // If table lacks newer columns, fall back safely to base columns
      const fallback = await supabase.from('orders').insert([basePayload]);
      error = fallback.error;
    }

    if (error) {
      console.warn('Supabase order sync notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase order sync error:', err);
    return false;
  }
}

/**
 * Persist a waiter call buzzer
 */
export async function syncWaiterCallToSupabase(call: WaiterCall): Promise<boolean> {
  if (!supabase) return false;
  try {
    if (!call.restaurantId) {
      console.warn('Cannot sync waiter call without restaurantId');
      return false;
    }

    const { error } = await supabase.from('waiter_calls').insert([
      {
        id: call.id,
        restaurant_id: call.restaurantId,
        table_number: call.tableNumber,
        reason: call.reason,
        status: call.status,
      },
    ]);

    if (error) {
      console.warn('Supabase waiter call notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase waiter sync error:', err);
    return false;
  }
}

/**
 * Fetch orders for a restaurant from Supabase
 */
export async function fetchOrdersFromSupabase(restaurantId: string, slug?: string): Promise<Order[]> {
  if (!supabase || !restaurantId) return [];
  try {
    // Only fetch today's orders — drastically cuts egress vs fetching all-time history
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    let query = supabase.from('orders').select('*').gte('created_at', todayISO);
    if (slug && slug !== restaurantId) {
      query = query.or(`restaurant_id.eq.${restaurantId},restaurant_id.eq.${slug}`);
    } else {
      query = query.eq('restaurant_id', restaurantId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });

    if (data && !error) {
      return data.map(row => {
        const rawDate = row.created_at;
        const normalizedDate = typeof rawDate === 'string' && rawDate.includes(' ') && !rawDate.includes('T')
          ? rawDate.replace(' ', 'T')
          : rawDate;
        const d = normalizedDate ? new Date(normalizedDate) : new Date();
        const safeTime = !isNaN(d.getTime()) 
          ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const safeTs = !isNaN(d.getTime()) ? d.getTime() : Date.now();

        const rawItems = Array.isArray(row.items) ? row.items : [];
        const normalizedItems = rawItems.map((ci: any) => {
          if (!ci) return { foodItem: { id: 'item', name: 'Item', price: 0 }, quantity: 1 };
          if (ci.foodItem) {
            return {
              ...ci,
              foodItem: {
                ...ci.foodItem,
                name: ci.foodItem.name || ci.name || 'Item',
                price: Number(ci.foodItem.price ?? ci.price ?? 0)
              },
              quantity: Number(ci.quantity) || 1
            };
          }
          return {
            ...ci,
            foodItem: {
              id: ci.id || 'item',
              name: ci.name || ci.title || 'Item',
              price: Number(ci.price || 0)
            },
            quantity: Number(ci.quantity) || 1
          };
        });

        return {
          id: row.id,
          restaurantId: row.restaurant_id,
          tableNumber: row.table_number,
          customerName: row.customer_name || 'Guest Diner',
          customerPhone: row.customer_phone || undefined,
          items: normalizedItems,
          subtotal: row.subtotal ? Number(row.subtotal) : undefined,
          vat: row.vat ? Number(row.vat) : undefined,
          total: Number(row.total) || 0,
          paymentMethod: row.payment_method || undefined,
          status: row.status || 'pending',
          createdAt: safeTime,
          createdAtTimestamp: safeTs,
          source: row.source || 'qr',
          orderType: row.order_type || 'dine_in',
          packagingFee: row.packaging_fee ? Number(row.packaging_fee) : undefined,
          packCount: row.pack_count ? Number(row.pack_count) : undefined
        };
      });
    }
  } catch (e) {
    console.warn('Fetch orders error:', e);
  }
  return [];
}

/**
 * Fetch waiter buzzer calls from Supabase
 */
export async function fetchWaiterCallsFromSupabase(restaurantId: string, slug?: string): Promise<WaiterCall[]> {
  if (!supabase || !restaurantId) return [];
  try {
    let query = supabase.from('waiter_calls').select('*');
    if (slug && slug !== restaurantId) {
      query = query.or(`restaurant_id.eq.${restaurantId},restaurant_id.eq.${slug}`);
    } else {
      query = query.eq('restaurant_id', restaurantId);
    }
    const { data, error } = await query
      .eq('status', 'active')
      .order('timestamp', { ascending: false });

    if (data && !error) {
      return data.map(row => ({
        id: row.id,
        restaurantId: row.restaurant_id,
        tableNumber: row.table_number,
        reason: row.reason,
        timestamp: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: row.status
      }));
    }
  } catch (e) {
    console.warn('Fetch waiter calls error:', e);
  }
  return [];
}

/**
 * Update order status in Supabase
 */
export async function updateOrderStatusInSupabase(orderId: string, status: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('orders').update({ status }).eq('id', orderId);
  } catch (e) {
    console.warn('Update order status error:', e);
  }
}

/**
 * Dismiss/resolve waiter call in Supabase
 */
export async function resolveWaiterCallInSupabase(callId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('waiter_calls').update({ status: 'resolved' }).eq('id', callId);
  } catch (e) {
    console.warn('Resolve waiter call error:', e);
  }
}

/**
 * Resolve the real restaurant database row ID (UUID / rest-xxx) for foreign key validity
 */
export async function resolveRestaurantDbId(idOrSlug: string): Promise<string> {
  if (!idOrSlug) return '';
  const clean = idOrSlug.trim();

  // 1. Check local cache
  const stored = getStoredRestaurants();
  const match = stored.find(r => r.id === clean || r.slug.toLowerCase() === clean.toLowerCase());
  if (match && match.id && match.id.startsWith('rest-')) {
    return match.id;
  }

  // 2. Query Supabase
  if (supabase) {
    try {
      const { data } = await supabase
        .from('restaurants')
        .select('id')
        .or(`id.eq.${clean},slug.eq.${clean.toLowerCase()}`)
        .maybeSingle();
      if (data?.id) return data.id;
    } catch (e) {
      console.warn('Error resolving restaurant DB ID:', e);
    }
  }

  return match?.id || clean;
}

/**
 * Save a dish to Supabase menu_items table with foreign key resolution & local cache sync
 */
export async function saveDishToSupabase(
  restaurantIdOrSlug: string,
  item: FoodItem,
  category: string = 'Main Menu'
): Promise<{ success: boolean; error?: string }> {
  const cleanCat = category.trim() || 'Main Menu';

  // Sync to local cache first so it's instantly visible
  try {
    const stored = getStoredRestaurants();
    const updated = stored.map(r => {
      if (r.id !== restaurantIdOrSlug && r.slug.toLowerCase() !== restaurantIdOrSlug.toLowerCase()) return r;
      let pageFound = false;
      const newPages = r.pages.map(p => {
        if (p.title.toLowerCase() === cleanCat.toLowerCase()) {
          pageFound = true;
          const itemExists = p.items.some(it => it.id === item.id);
          const newItems = itemExists
            ? p.items.map(it => it.id === item.id ? { ...it, ...item } : it)
            : [...p.items, item];
          return { ...p, items: newItems };
        }
        return p;
      });
      if (!pageFound) {
        newPages.push({
          id: `p-${Date.now()}`,
          pageNumber: newPages.length + 1,
          title: cleanCat,
          subtitle: `${cleanCat} prepared fresh daily`,
          layout: 'two_column_grid',
          items: [item]
        });
      }
      return { ...r, pages: newPages };
    });
    saveStoredRestaurants(updated);
  } catch (err) {
    console.warn('Local dish cache update error:', err);
  }

  if (!supabase) return { success: false, error: 'Supabase offline' };

  try {
    const resolvedRestId = await resolveRestaurantDbId(restaurantIdOrSlug);
    if (!resolvedRestId) {
      console.error('Cannot save dish: restaurant not found', restaurantIdOrSlug);
      return { success: false, error: 'Restaurant ID not found' };
    }

    const baseDishPayload = {
      id: item.id,
      restaurant_id: resolvedRestId,
      category: cleanCat,
      name: item.name,
      description: item.description || '',
      price: Number(item.price) || 0,
      badge: item.badge || '',
      image_url: item.imageUrl || '',
      prep_time: item.prepTime || '15 min',
      allergens: item.allergens || [],
      is_sold_out: Boolean(item.isSoldOut)
    };

    let { error } = await supabase.from('menu_items').upsert({
      ...baseDishPayload,
      modifiers: item.modifierGroups || []
    }, { onConflict: 'id' });

    if (error && (error.code === '42703' || error.message?.includes('modifiers'))) {
      const retry = await supabase.from('menu_items').upsert(baseDishPayload, { onConflict: 'id' });
      error = retry.error;
    }

    if (error) {
      console.error('Supabase save dish error:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn('Save dish to Supabase exception:', e);
    return { success: false, error: e?.message || 'Error saving dish' };
  }
}

/**
 * Rename a category across all dishes in Supabase and local cache
 */
export async function renameCategoryInSupabase(
  restaurantIdOrSlug: string,
  oldTitle: string,
  newTitle: string
): Promise<boolean> {
  const cleanOld = oldTitle.trim();
  const cleanNew = newTitle.trim();
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return true;

  // 1. Update local cache
  try {
    const stored = getStoredRestaurants();
    const updated = stored.map(r => {
      if (r.id !== restaurantIdOrSlug && r.slug.toLowerCase() !== restaurantIdOrSlug.toLowerCase()) return r;
      return {
        ...r,
        pages: r.pages.map(p => {
          if (p.title.toLowerCase() === cleanOld.toLowerCase()) {
            return {
              ...p,
              title: cleanNew,
              subtitle: `${cleanNew} prepared fresh daily`
            };
          }
          return p;
        })
      };
    });
    saveStoredRestaurants(updated);
  } catch (err) {
    console.warn('Local category rename error:', err);
  }

  if (!supabase) return false;

  try {
    const resolvedRestId = await resolveRestaurantDbId(restaurantIdOrSlug);
    if (!resolvedRestId) return false;

    // Update in Supabase menu_items table
    const { error } = await supabase
      .from('menu_items')
      .update({ category: cleanNew })
      .eq('restaurant_id', resolvedRestId)
      .ilike('category', cleanOld);

    if (error) {
      console.warn('Supabase rename category error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Supabase rename category exception:', e);
    return false;
  }
}

/**
 * Delete dish from Supabase & local storage
 */
export async function deleteDishFromSupabase(itemId: string): Promise<boolean> {
  // Sync to local cache
  try {
    const stored = getStoredRestaurants();
    const updated = stored.map(r => ({
      ...r,
      pages: r.pages.map(p => ({
        ...p,
        items: p.items.filter(it => it.id !== itemId)
      }))
    }));
    saveStoredRestaurants(updated);
  } catch {}

  if (!supabase) return false;
  try {
    const { error } = await supabase.from('menu_items').delete().eq('id', itemId);
    if (error) {
      console.error('Supabase delete dish error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Delete dish from Supabase error:', e);
    return false;
  }
}

/**
 * Fetch all registered restaurants from Supabase for Super Admin
 */
export async function fetchAllRestaurantsFromSupabase(): Promise<RestaurantTenant[]> {
  const localList = getStoredRestaurants();
  if (supabase) {
    try {
      const { data: rRows, error: rErr } = await supabase
        .from('restaurants')
        .select('*')
        .order('created_at', { ascending: false });

      if (rRows && !rErr) {
        // Fetch all menu items
        const { data: allItems } = await supabase.from('menu_items').select('*');
        const itemsByRestId: Record<string, any[]> = {};
        if (allItems) {
          allItems.forEach(it => {
            if (!itemsByRestId[it.restaurant_id]) itemsByRestId[it.restaurant_id] = [];
            itemsByRestId[it.restaurant_id].push(it);
          });
        }

        const dbRestaurants = rRows.map(r => {
          const mapped = mapDbRowToRestaurant(r, itemsByRestId[r.id] || []);
          // Check local cache for client-side plan / limit overrides (only if unset in Supabase)
          const cached = localList.find(c => c.id === r.id || c.slug === r.slug);
          if (cached) {
            if (cached.plan && !r.plan && !r.design?.plan) mapped.plan = cached.plan;
            if (cached.tableLimit !== undefined && r.table_limit === undefined) mapped.tableLimit = cached.tableLimit;
          }
          return mapped;
        });

        // Supabase is the single source of truth: strictly sync and purge deleted restaurants
        saveStoredRestaurants(dbRestaurants);
        return dbRestaurants;
      }
    } catch (e) {
      console.warn('Super Admin fetch all restaurants error:', e);
    }
  }
  return localList;
}

/**
 * Update restaurant status in Supabase
 */
export async function updateRestaurantStatusInSupabase(restaurantId: string, status: 'active' | 'suspended'): Promise<void> {
  const stored = getStoredRestaurants();
  const updated = stored.map(r => r.id === restaurantId ? { ...r, status } : r);
  saveStoredRestaurants(updated);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tapmenu_status_updated', { detail: { restaurantId, status } }));
    try {
      const bc = new BroadcastChannel('tapmenu_live_sync');
      bc.postMessage({ type: 'STATUS_UPDATED', restaurantId, status });
      bc.close();
    } catch {}
  }

  if (!supabase) return;
  try {
    await supabase.from('restaurants').update({ status }).eq('id', restaurantId);
  } catch (e) {
    console.warn('Update restaurant status error:', e);
  }
}

/**
 * Persist restaurant tables to local storage & Supabase
 */
export async function syncRestaurantTablesToSupabase(restaurantId: string, tables: any[]): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`tapmenu_tables_${restaurantId}`, JSON.stringify(tables));
    }
  } catch {}

  const stored = getStoredRestaurants();
  const updated = stored.map(r => r.id === restaurantId ? { ...r, tables } : r);
  saveStoredRestaurants(updated);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tapmenu_tables_updated', { detail: { restaurantId, tables } }));
    try {
      const bc = new BroadcastChannel('tapmenu_live_sync');
      bc.postMessage({ type: 'TABLES_UPDATED', restaurantId, tables });
      bc.close();
    } catch {}
  }

  if (!supabase) return;
  try {
    const { error } = await supabase.from('restaurants').update({
      tables: tables
    }).eq('id', restaurantId);

    if (error && (error.code === '42703' || error.message?.includes('column'))) {
      // tables column not in Supabase schema yet; local storage already holds it safely
    }
  } catch (e) {
    console.warn('Update restaurant tables error:', e);
  }
}

/**
 * Update restaurant plan and optional tableLimit override in Supabase + local cache
 */
export async function updateRestaurantPlanInSupabase(
  restaurantId: string,
  plan: string,
  tableLimit: number | null
): Promise<void> {
  // Update local cache first for instant UI feedback
  const stored = getStoredRestaurants();
  const updated = stored.map(r => r.id === restaurantId ? { ...r, plan, tableLimit } : r);
  saveStoredRestaurants(updated);

  // Broadcast instantly across same tab and other tabs
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tapmenu_plan_updated', { 
      detail: { restaurantId, plan, tableLimit } 
    }));
    try {
      const bc = new BroadcastChannel('tapmenu_live_sync');
      bc.postMessage({ type: 'PLAN_UPDATED', restaurantId, plan, tableLimit });
      bc.close();
    } catch {}
  }

  if (!supabase) return;
  try {
    const { error } = await supabase.from('restaurants').update({
      plan,
      table_limit: tableLimit  // store null = unlimited
    }).eq('id', restaurantId);

    if (error && (error.code === '42703' || error.message?.includes('column'))) {
      console.warn('Note: restaurants.plan column not yet in Supabase schema. Saved in local cache.');
    }
  } catch (e) {
    console.warn('Update restaurant plan error:', e);
  }
}

/**
 * Persist restaurant metadata (logo, name, tagline, address, phone, coverImage, design colors) to Supabase & local cache
 */
export async function syncRestaurantMetaToSupabase(
  restaurantId: string,
  meta: Partial<RestaurantTenant>
): Promise<void> {
  const stored = getStoredRestaurants();
  const updated = stored.map(r => r.id === restaurantId ? { ...r, ...meta } : r);
  saveStoredRestaurants(updated);

  if (typeof window !== 'undefined') {
    try {
      const bc = new BroadcastChannel('tapmenu_live_sync');
      bc.postMessage({ type: 'META_UPDATED', restaurantId, meta });
      bc.close();
    } catch {}
  }

  if (!supabase) return;

  try {
    const updatePayload: Record<string, any> = {};
    if (meta.name !== undefined) updatePayload.name = meta.name;
    if (meta.tagline !== undefined) updatePayload.tagline = meta.tagline;
    if (meta.logo !== undefined) updatePayload.logo = meta.logo;
    if (meta.coverImage !== undefined) updatePayload.cover_image = meta.coverImage;
    if (meta.address !== undefined) updatePayload.address = meta.address;
    if (meta.phone !== undefined) updatePayload.phone = meta.phone;
    if (meta.openingHours !== undefined) updatePayload.opening_hours = meta.openingHours;
    if (meta.packagingFeePerPack !== undefined) updatePayload.packaging_fee = meta.packagingFeePerPack;
    if (meta.deliveryFee !== undefined) updatePayload.delivery_fee = meta.deliveryFee;
    if (meta.serviceMode !== undefined) updatePayload.service_mode = meta.serviceMode;
    if (meta.subscriptionExpiresAt !== undefined) updatePayload.subscription_expires_at = meta.subscriptionExpiresAt || null;

    // Fetch existing row to merge design & settings cleanly
    let existingDesign: Record<string, any> = {};
    try {
      const { data: existingRow } = await supabase
        .from('restaurants')
        .select('design')
        .eq('id', restaurantId)
        .maybeSingle();

      if (existingRow && typeof existingRow.design === 'object' && existingRow.design !== null) {
        existingDesign = existingRow.design;
      }
    } catch {}

    const mergedDesign = {
      ...existingDesign,
      ...(meta.design || {}),
      ...(meta.bankName !== undefined ? { bankName: meta.bankName } : {}),
      ...(meta.accountNumber !== undefined ? { accountNumber: meta.accountNumber } : {}),
      ...(meta.accountName !== undefined ? { accountName: meta.accountName } : {}),
      ...(meta.instagramUrl !== undefined ? { instagramUrl: meta.instagramUrl } : {}),
      ...(meta.tiktokUrl !== undefined ? { tiktokUrl: meta.tiktokUrl } : {}),
      ...(meta.cacCertificateUrl !== undefined ? { cacCertificateUrl: meta.cacCertificateUrl } : {}),
      ...(meta.cacStatus !== undefined ? { cacStatus: meta.cacStatus } : {}),
      ...(meta.packagingFeePerPack !== undefined ? { packagingFeePerPack: meta.packagingFeePerPack } : {}),
      ...(meta.deliveryFee !== undefined ? { deliveryFee: meta.deliveryFee } : {}),
      ...(meta.subscriptionExpiresAt !== undefined ? { subscriptionExpiresAt: meta.subscriptionExpiresAt } : {}),
    };

    updatePayload.design = mergedDesign;

    // Optional top-level columns if present in table
    if (meta.design?.coverColor) updatePayload.cover_color = meta.design.coverColor;
    if (meta.design?.coverTextColor) updatePayload.cover_text_color = meta.design.coverTextColor;
    if (meta.design?.primaryColor) updatePayload.primary_color = meta.design.primaryColor;
    if (meta.design?.accentColor) updatePayload.accent_color = meta.design.accentColor;
    if (meta.design?.currencySymbol) updatePayload.currency = meta.design.currencySymbol;
    if (meta.bankName !== undefined) updatePayload.bank_name = meta.bankName;
    if (meta.accountNumber !== undefined) updatePayload.account_number = meta.accountNumber;
    if (meta.accountName !== undefined) updatePayload.account_name = meta.accountName;
    if (meta.cacCertificateUrl !== undefined) updatePayload.cac_certificate_url = meta.cacCertificateUrl;
    if (meta.cacStatus !== undefined) updatePayload.cac_status = meta.cacStatus;

    if (Object.keys(updatePayload).length > 0) {
      let { error } = await supabase
        .from('restaurants')
        .update(updatePayload)
        .eq('id', restaurantId);

      // If top-level columns fail due to missing schema columns, fall back safely to design JSONB!
      if (error && (error.message?.includes('column') || error.code === '42703')) {
        const safePayload: Record<string, any> = { design: mergedDesign };
        if (updatePayload.name) safePayload.name = updatePayload.name;
        if (updatePayload.tagline) safePayload.tagline = updatePayload.tagline;
        if (updatePayload.logo) safePayload.logo = updatePayload.logo;
        if (updatePayload.address) safePayload.address = updatePayload.address;
        if (updatePayload.phone) safePayload.phone = updatePayload.phone;
        const res = await supabase.from('restaurants').update(safePayload).eq('id', restaurantId);
        error = res.error;
      }

      if (error) {
        console.warn('Supabase restaurant meta update notice:', error.message);
      }
    }
  } catch (err) {
    console.warn('Supabase restaurant meta update error:', err);
  }
}

/**
 * Cloud Settings Sync (for subscription plans & platform configurations)
 */
export async function savePlatformSettingsToSupabase(key: string, value: any): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('platform_settings').upsert({
      key,
      value,
      updated_at: new Date().toISOString()
    });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchPlatformSettingsFromSupabase(key: string): Promise<any | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (data && !error) return data.value;
  } catch {
    // Fall back to local
  }
  return null;
}

/**
 * Platform WhatsApp & Contact Settings
 */
export interface PlatformContactConfig {
  whatsappNumber: string;
  whatsappMessage: string;
  supportEmail: string;
}

export const DEFAULT_PLATFORM_CONTACT: PlatformContactConfig = {
  whatsappNumber: '2348000000000',
  whatsappMessage: "Hello TapMenu Team! I'd like to learn more about digital menus for my restaurant.",
  supportEmail: 'support@tapmenu.me'
};

const KEY_PLATFORM_CONTACT = 'tapmenu_platform_contact_v1';

export function getStoredPlatformContact(): PlatformContactConfig {
  try {
    const raw = localStorage.getItem(KEY_PLATFORM_CONTACT);
    if (raw) return { ...DEFAULT_PLATFORM_CONTACT, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PLATFORM_CONTACT;
}

export async function fetchPlatformContactConfig(): Promise<PlatformContactConfig> {
  const stored = getStoredPlatformContact();
  if (!supabase) return stored;
  try {
    const remote = await fetchPlatformSettingsFromSupabase('platform_contact');
    if (remote && remote.whatsappNumber) {
      const merged = { ...DEFAULT_PLATFORM_CONTACT, ...remote };
      localStorage.setItem(KEY_PLATFORM_CONTACT, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.debug('Failed to fetch remote platform contact config:', err);
  }
  return stored;
}

export async function savePlatformContactConfig(config: Partial<PlatformContactConfig>): Promise<boolean> {
  const current = getStoredPlatformContact();
  const rawNum = config.whatsappNumber !== undefined ? config.whatsappNumber : current.whatsappNumber;
  const cleanNumber = rawNum.replace(/[^0-9]/g, '');

  const updated: PlatformContactConfig = {
    ...current,
    ...config,
    whatsappNumber: cleanNumber || current.whatsappNumber,
  };

  localStorage.setItem(KEY_PLATFORM_CONTACT, JSON.stringify(updated));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tapmenu_contact_updated', { detail: updated }));
  }

  if (supabase) {
    try {
      await savePlatformSettingsToSupabase('platform_contact', updated);
    } catch (e) {
      console.warn('Failed to save platform contact to Supabase:', e);
    }
  }
  return true;
}

export async function deleteRestaurantFromSupabase(restaurantId: string): Promise<void> {
  // 1. Immediately purge from local storage cache so it NEVER resurrects
  try {
    const stored = getStoredRestaurants();
    const target = stored.find(r => r.id === restaurantId || r.slug === restaurantId);
    const updated = stored.filter(r => r.id !== restaurantId && r.slug !== restaurantId);
    saveStoredRestaurants(updated);

    const activeSess = getActiveSession();
    if (activeSess && (activeSess.restaurantId === restaurantId || activeSess.restaurantSlug === restaurantId)) {
      setActiveSession(null);
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`tapmenu_tables_${restaurantId}`);
      localStorage.removeItem(`tapmenu_inventory_${restaurantId}`);
      localStorage.removeItem(`tapmenu_expenses_${restaurantId}`);
      if (target?.slug) {
        localStorage.removeItem(`tapmenu_tables_${target.slug}`);
      }
    }
  } catch (e) {
    console.warn('Local cache cleanup on restaurant delete error:', e);
  }

  // 2. Delete all records from Supabase tables and purge login
  if (supabase) {
    try {
      const { data: restRow } = await supabase.from('restaurants').select('owner_id').eq('id', restaurantId).maybeSingle();
      const ownerId = restRow?.owner_id;

      await supabase.from('menu_items').delete().eq('restaurant_id', restaurantId);
      await supabase.from('orders').delete().eq('restaurant_id', restaurantId);
      await supabase.from('waiter_calls').delete().eq('restaurant_id', restaurantId);
      try {
        await supabase.from('card_orders').delete().eq('restaurant_id', restaurantId);
      } catch {}
      await supabase.from('restaurants').delete().eq('id', restaurantId);

      // Attempt to purge auth user record from auth.users
      if (ownerId) {
        // Try admin_delete_user RPC first (Security Definer Postgres function)
        try {
          await supabase.rpc('admin_delete_user', { target_user_id: ownerId });
        } catch {}

        // Fallback to supabase.auth.admin if service role key available
        if ((supabase.auth as any).admin?.deleteUser) {
          try {
            await (supabase.auth as any).admin.deleteUser(ownerId);
          } catch {}
        }
      }

      // If current browser session belongs to this deleted restaurant, sign out immediately
      try {
        const { data: userSess } = await supabase.auth.getUser();
        if (userSess?.user?.id === ownerId) {
          await supabase.auth.signOut();
        }
      } catch {}
    } catch (e) {
      console.warn('Delete restaurant from Supabase error:', e);
    }
  }

  // 3. Broadcast deletion event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tapmenu_restaurant_deleted', { detail: { restaurantId } }));
    try {
      const bc = new BroadcastChannel('tapmenu_live_sync');
      bc.postMessage({ type: 'RESTAURANT_DELETED', restaurantId });
      bc.close();
    } catch {}
  }
}



/**
 * Fetch shifts history from Supabase
 */
export async function fetchShiftsFromSupabase(restaurantId: string): Promise<any[]> {
  const localKey = `tapmenu_shift_history_${restaurantId}`;
  let localShifts: any[] = [];
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) localShifts = JSON.parse(raw);
  } catch {}

  if (!supabase || !restaurantId) return localShifts;

  try {
    const resolvedId = await resolveRestaurantDbId(restaurantId);
    const { data, error } = await supabase
      .from('kitchen_shifts')
      .select('*')
      .or(`restaurant_id.eq.${resolvedId},restaurant_id.eq.${restaurantId}`)
      .order('created_at', { ascending: false });

    if (!error && data && Array.isArray(data)) {
      const mapped = data.map((row: any) => ({
        shiftId: row.shift_id || row.id,
        startedAt: row.started_at,
        startedAtTs: Number(row.started_at_ts) || Date.now() - 3600000,
        endedAt: row.ended_at,
        endedAtTs: Number(row.ended_at_ts) || Date.now(),
        date: row.date,
        totalRevenue: Number(row.total_revenue) || 0,
        totalOrders: Number(row.total_orders) || 0,
        servedOrders: Number(row.served_orders) || 0,
        vat: Number(row.vat) || 0,
        payments: row.payments || {}
      }));
      localStorage.setItem(localKey, JSON.stringify(mapped));
      return mapped;
    }
  } catch (err) {
    console.warn('fetchShiftsFromSupabase notice:', err);
  }

  return localShifts;
}

/**
 * Persist shift reconciliation report to Supabase
 */
export async function saveShiftToSupabase(restaurantId: string, shift: any): Promise<boolean> {
  const localKey = `tapmenu_shift_history_${restaurantId}`;
  try {
    const existing = JSON.parse(localStorage.getItem(localKey) || '[]');
    const filtered = existing.filter((s: any) => s.shiftId !== shift.shiftId);
    filtered.unshift(shift);
    localStorage.setItem(localKey, JSON.stringify(filtered.slice(0, 90)));
  } catch {}

  if (!supabase || !restaurantId) return false;

  try {
    const resolvedId = await resolveRestaurantDbId(restaurantId);
    const payload = {
      id: shift.shiftId || `sh-${Date.now()}`,
      restaurant_id: resolvedId || restaurantId,
      shift_id: shift.shiftId || `sh-${Date.now()}`,
      started_at: shift.startedAt || '8:00 AM',
      started_at_ts: shift.startedAtTs || Date.now(),
      ended_at: shift.endedAt || '',
      ended_at_ts: shift.endedAtTs || Date.now(),
      date: shift.date || new Date().toISOString().split('T')[0],
      total_revenue: Number(shift.totalRevenue) || 0,
      total_orders: Number(shift.totalOrders) || 0,
      served_orders: Number(shift.servedOrders) || 0,
      vat: Number(shift.vat) || 0,
      payments: shift.payments || {}
    };

    const { error } = await supabase.from('kitchen_shifts').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn('Supabase save kitchen_shifts notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('saveShiftToSupabase exception:', err);
    return false;
  }
}

/**
 * Bulk sync all local dishes up to Supabase so mobile and PC match instantly
 */
export async function syncAllDishesToSupabase(
  restaurantIdOrSlug: string,
  dishes: Array<{ item: FoodItem; category: string }>
): Promise<number> {
  if (!supabase || !restaurantIdOrSlug || dishes.length === 0) return 0;
  try {
    const resolvedRestId = await resolveRestaurantDbId(restaurantIdOrSlug);
    if (!resolvedRestId) return 0;

    let syncedCount = 0;
    for (const entry of dishes) {
      const cleanCat = (entry.category || 'Main Menu').trim();
      const it = entry.item;
      const { error } = await supabase.from('menu_items').upsert({
        id: it.id,
        restaurant_id: resolvedRestId,
        category: cleanCat,
        name: it.name,
        description: it.description || '',
        price: Number(it.price) || 0,
        badge: it.badge || '',
        image_url: it.imageUrl || '',
        prep_time: it.prepTime || '15 min',
        allergens: it.allergens || [],
        is_sold_out: Boolean(it.isSoldOut)
      }, { onConflict: 'id' });
      if (!error) syncedCount++;
    }
    return syncedCount;
  } catch (err) {
    console.warn('syncAllDishesToSupabase exception:', err);
    return 0;
  }
}


