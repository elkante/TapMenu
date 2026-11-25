import { CustomerProfile, Order } from '../types';
import { supabase, resolveRestaurantDbId } from './supabase';

const crmStorageKey = (restaurantId: string) => `dinetap_crm_v1_${restaurantId}`;

/**
 * Normalize Nigerian and international phone numbers to canonical digits (e.g. 2348031234567)
 */
export function normalizePhone(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  let digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';

  // Handle +234080... typo -> 23480...
  if (digits.startsWith('2340') && digits.length === 14) {
    digits = '234' + digits.slice(4);
  }
  // Standard 11-digit Nigerian number: 0803... / 070... / 090... / 081...
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = '234' + digits.slice(1);
  }
  // 10-digit Nigerian number without leading 0
  if (digits.length === 10 && /^[789]/.test(digits)) {
    digits = '234' + digits;
  }
  return digits;
}

export function buildWhatsAppLink(phone: string, message?: string): string | null {
  const norm = normalizePhone(phone);
  if (norm.length < 10) return null;
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${norm}${query}`;
}

export function getStoredCustomers(restaurantId: string): CustomerProfile[] {
  if (!restaurantId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(crmStorageKey(restaurantId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('CRM local read error:', e);
  }
  return [];
}

export function saveStoredCustomers(restaurantId: string, customers: CustomerProfile[]) {
  if (!restaurantId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(crmStorageKey(restaurantId), JSON.stringify(customers));
  } catch (e) {
    console.warn('CRM local write error:', e);
  }
}

const isGenericCustomerName = (name: string) => {
  const lower = name.trim().toLowerCase();
  return (
    !lower ||
    lower === 'guest' ||
    lower === 'guest diner' ||
    lower === 'takeout customer' ||
    lower === 'delivery customer' ||
    lower.startsWith('diner at ')
  );
};

/**
 * Record an order into the tenant's CRM (strictly scoped by restaurantId).
 */
export async function recordOrderToCustomerCrm(restaurantId: string, order: Order): Promise<CustomerProfile | null> {
  if (!restaurantId || !order) return null;
  // Strict tenant guard: only record if order belongs to this restaurant
  if (order.restaurantId && order.restaurantId !== restaurantId) return null;

  const rawPhone = (order.customerPhone || '').trim();
  const normPhone = normalizePhone(rawPhone);
  const rawName = (order.customerName || '').trim();

  // Require at least a real phone number (>= 7 digits) or a non-generic customer name
  if (normPhone.length < 7 && isGenericCustomerName(rawName)) {
    return null;
  }

  const key = normPhone.length >= 7 ? normPhone : `name:${rawName.toLowerCase()}`;
  const displayName = !isGenericCustomerName(rawName) ? rawName : (rawPhone || 'Customer');
  const nowTs = order.createdAtTimestamp || Date.now();

  const existingList = getStoredCustomers(restaurantId);
  const existingIdx = existingList.findIndex(c => c.normalizedPhone === key);

  let updatedProfile: CustomerProfile;
  if (existingIdx >= 0) {
    const curr = existingList[existingIdx];
    const favMap = { ...(curr.favoriteItems || {}) };
    (order.items || []).forEach(ci => {
      const itemName = ci?.foodItem?.name || (ci as any)?.name;
      if (itemName) {
        favMap[itemName] = (favMap[itemName] || 0) + (ci.quantity || 1);
      }
    });

    const nextOrders = curr.totalOrders + 1;
    const nextSpend = curr.totalSpend + (Number(order.total) || 0);
    const nextTags = new Set(curr.tags || []);
    if (nextOrders >= 3 || nextSpend >= 50000) nextTags.add('VIP');
    else if (nextOrders >= 2) nextTags.add('Repeat');
    if (order.orderType === 'delivery') nextTags.add('Delivery');

    updatedProfile = {
      ...curr,
      name: !isGenericCustomerName(rawName) ? rawName : curr.name,
      phone: rawPhone || curr.phone,
      totalOrders: nextOrders,
      totalSpend: nextSpend,
      lastOrderAt: Math.max(curr.lastOrderAt || 0, nowTs),
      lastOrderType: order.orderType || curr.lastOrderType,
      favoriteItems: favMap,
      tags: Array.from(nextTags),
    };
    existingList[existingIdx] = updatedProfile;
  } else {
    const favMap: Record<string, number> = {};
    (order.items || []).forEach(ci => {
      const itemName = ci?.foodItem?.name || (ci as any)?.name;
      if (itemName) {
        favMap[itemName] = (favMap[itemName] || 0) + (ci.quantity || 1);
      }
    });

    const tags: string[] = ['New'];
    if ((Number(order.total) || 0) >= 50000) tags.push('VIP');
    if (order.orderType === 'delivery') tags.push('Delivery');

    updatedProfile = {
      id: `cust-${restaurantId}-${Date.now()}-${Math.floor(Math.random() * 899 + 100)}`,
      restaurantId,
      name: displayName,
      phone: rawPhone || 'No phone',
      normalizedPhone: key,
      totalOrders: 1,
      totalSpend: Number(order.total) || 0,
      lastOrderAt: nowTs,
      lastOrderType: order.orderType || 'dine_in',
      favoriteItems: favMap,
      tags,
      notes: '',
      createdAt: nowTs,
    };
    existingList.unshift(updatedProfile);
  }

  saveStoredCustomers(restaurantId, existingList);

  if (supabase) {
    try {
      const resolvedId = await resolveRestaurantDbId(restaurantId);
      if (resolvedId) {
        await supabase.from('customers').upsert(
          {
            id: updatedProfile.id,
            restaurant_id: resolvedId,
            name: updatedProfile.name,
            phone: updatedProfile.phone,
            normalized_phone: updatedProfile.normalizedPhone,
            total_orders: updatedProfile.totalOrders,
            total_spend: updatedProfile.totalSpend,
            last_order_at: updatedProfile.lastOrderAt,
            last_order_type: updatedProfile.lastOrderType,
            favorite_items: updatedProfile.favoriteItems,
            tags: updatedProfile.tags,
            notes: updatedProfile.notes || '',
            created_at: updatedProfile.createdAt,
          },
          { onConflict: 'restaurant_id,normalized_phone' }
        );
      }
    } catch (e) {
      console.debug('CRM Supabase sync notice:', e);
    }
  }

  return updatedProfile;
}

export async function fetchCustomersFromSupabase(restaurantId: string): Promise<CustomerProfile[]> {
  const local = getStoredCustomers(restaurantId);
  if (!supabase || !restaurantId) return local;

  try {
    const resolvedId = await resolveRestaurantDbId(restaurantId);
    if (!resolvedId) return local;

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('restaurant_id', resolvedId)
      .order('total_spend', { ascending: false });

    if (!error && Array.isArray(data)) {
      const mapped: CustomerProfile[] = data.map((row: any) => ({
        id: row.id,
        restaurantId,
        name: row.name,
        phone: row.phone,
        normalizedPhone: row.normalized_phone,
        totalOrders: Number(row.total_orders) || 0,
        totalSpend: Number(row.total_spend) || 0,
        lastOrderAt: Number(row.last_order_at) || Date.now(),
        lastOrderType: row.last_order_type || 'dine_in',
        favoriteItems: (typeof row.favorite_items === 'object' && row.favorite_items) ? row.favorite_items : {},
        tags: Array.isArray(row.tags) ? row.tags : [],
        notes: row.notes || '',
        createdAt: Number(row.created_at) || Date.now(),
      }));

      // Merge any local-only customers not yet synced
      const remoteKeys = new Set(mapped.map(m => m.normalizedPhone));
      const merged = [...mapped, ...local.filter(l => !remoteKeys.has(l.normalizedPhone))];
      saveStoredCustomers(restaurantId, merged);
      return merged;
    }
  } catch (e) {
    console.debug('CRM fetch fallback to local:', e);
  }
  return local;
}

export async function updateCustomerProfileInCrm(restaurantId: string, updated: CustomerProfile): Promise<void> {
  const list = getStoredCustomers(restaurantId).map(c =>
    c.id === updated.id || c.normalizedPhone === updated.normalizedPhone ? updated : c
  );
  saveStoredCustomers(restaurantId, list);

  if (supabase) {
    try {
      const resolvedId = await resolveRestaurantDbId(restaurantId);
      if (resolvedId) {
        await supabase
          .from('customers')
          .update({
            name: updated.name,
            phone: updated.phone,
            tags: updated.tags,
            notes: updated.notes || '',
          })
          .eq('restaurant_id', resolvedId)
          .eq('normalized_phone', updated.normalizedPhone);
      }
    } catch (e) {
      console.debug('CRM update notice:', e);
    }
  }
}

/**
 * Rebuild/backfill customer profiles from existing orders for this restaurant only.
 */
export function buildCrmFromOrders(restaurantId: string, orders: Order[], existing: CustomerProfile[]): CustomerProfile[] {
  const map = new Map<string, CustomerProfile>();
  existing.forEach(c => map.set(c.normalizedPhone, { ...c }));

  // Aggregate fresh totals from orders so counts are accurate
  const orderAgg = new Map<string, {
    name: string;
    phone: string;
    totalOrders: number;
    totalSpend: number;
    lastOrderAt: number;
    lastOrderType: string;
    favoriteItems: Record<string, number>;
    createdAt: number;
  }>();

  orders.forEach(o => {
    if (o.restaurantId && o.restaurantId !== restaurantId) return;
    const rawPhone = (o.customerPhone || '').trim();
    const normPhone = normalizePhone(rawPhone);
    const rawName = (o.customerName || '').trim();
    if (normPhone.length < 7 && isGenericCustomerName(rawName)) return;

    const key = normPhone.length >= 7 ? normPhone : `name:${rawName.toLowerCase()}`;
    const ts = o.createdAtTimestamp || Date.now();
    const curr = orderAgg.get(key) || {
      name: !isGenericCustomerName(rawName) ? rawName : (rawPhone || 'Customer'),
      phone: rawPhone || 'No phone',
      totalOrders: 0,
      totalSpend: 0,
      lastOrderAt: ts,
      lastOrderType: o.orderType || 'dine_in',
      favoriteItems: {},
      createdAt: ts,
    };

    if (!isGenericCustomerName(rawName)) curr.name = rawName;
    if (rawPhone) curr.phone = rawPhone;
    curr.totalOrders += 1;
    curr.totalSpend += Number(o.total) || 0;
    if (ts >= curr.lastOrderAt) {
      curr.lastOrderAt = ts;
      curr.lastOrderType = o.orderType || curr.lastOrderType;
    }
    if (ts < curr.createdAt) curr.createdAt = ts;
    (o.items || []).forEach(ci => {
      const itemName = ci?.foodItem?.name || (ci as any)?.name;
      if (itemName) {
        curr.favoriteItems[itemName] = (curr.favoriteItems[itemName] || 0) + (ci.quantity || 1);
      }
    });
    orderAgg.set(key, curr);
  });

  orderAgg.forEach((agg, key) => {
    const prev = map.get(key);
    const tags = new Set(prev?.tags || []);
    if (agg.totalOrders >= 3 || agg.totalSpend >= 50000) tags.add('VIP');
    else if (agg.totalOrders >= 2) tags.add('Repeat');
    if (agg.lastOrderType === 'delivery') tags.add('Delivery');
    if (tags.size === 0) tags.add('New');

    map.set(key, {
      id: prev?.id || `cust-${restaurantId}-${key.slice(-8)}`,
      restaurantId,
      name: agg.name,
      phone: agg.phone,
      normalizedPhone: key,
      totalOrders: Math.max(prev?.totalOrders || 0, agg.totalOrders),
      totalSpend: Math.max(prev?.totalSpend || 0, agg.totalSpend),
      lastOrderAt: Math.max(prev?.lastOrderAt || 0, agg.lastOrderAt),
      lastOrderType: agg.lastOrderType,
      favoriteItems: Object.keys(agg.favoriteItems).length > 0 ? agg.favoriteItems : (prev?.favoriteItems || {}),
      tags: Array.from(tags),
      notes: prev?.notes || '',
      createdAt: prev?.createdAt || agg.createdAt,
    });
  });

  const result = Array.from(map.values()).sort((a, b) => b.totalSpend - a.totalSpend);
  saveStoredCustomers(restaurantId, result);
  return result;
}
