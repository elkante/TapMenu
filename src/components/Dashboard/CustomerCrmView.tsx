import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Award,
  Phone,
  Search,
  Download,
  RefreshCw,
  MessageSquare,
  Tag,
  FileText,
  CheckCircle2,
  ChevronRight,
  X,
  Sparkles,
  TrendingUp,
  Calendar,
  Heart,
  Gift,
  ExternalLink,
  Plus
} from 'lucide-react';
import { CustomerProfile, Order } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  getStoredCustomers,
  fetchCustomersFromSupabase,
  updateCustomerProfileInCrm,
  buildCrmFromOrders,
  buildWhatsAppLink,
  normalizePhone
} from '../../utils/crmStorage';

interface CustomerCrmViewProps {
  restaurantId: string;
  currencySymbol?: string;
}

type FilterTag = 'all' | 'vip' | 'repeat' | 'new' | 'delivery' | 'recent';

export const CustomerCrmView: React.FC<CustomerCrmViewProps> = ({
  restaurantId,
  currencySymbol = '₦'
}) => {
  const { orders, activeRestaurant, showNotification } = useApp();
  const [customers, setCustomers] = useState<CustomerProfile[]>(() =>
    getStoredCustomers(restaurantId)
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTag>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Drawer edit state
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [isSavingDrawer, setIsSavingDrawer] = useState(false);

  // Load and sync on mount or restaurantId change
  useEffect(() => {
    const local = getStoredCustomers(restaurantId);
    setCustomers(local);

    let isMounted = true;
    fetchCustomersFromSupabase(restaurantId)
      .then(remote => {
        if (isMounted && remote && remote.length > 0) {
          setCustomers(remote);
        }
      })
      .catch(e => console.debug('CRM remote sync notice:', e));

    return () => {
      isMounted = false;
    };
  }, [restaurantId]);

  // Sync drawer form state when selected customer changes
  useEffect(() => {
    if (selectedCustomer) {
      setEditName(selectedCustomer.name || '');
      setEditNotes(selectedCustomer.notes || '');
      setEditTags(Array.isArray(selectedCustomer.tags) ? [...selectedCustomer.tags] : []);
      setNewTagInput('');
    }
  }, [selectedCustomer]);

  // Backfill customers from historical orders
  const handleBackfillOrders = () => {
    setIsSyncing(true);
    try {
      const updated = buildCrmFromOrders(restaurantId, orders, customers);
      setCustomers(updated);
      showNotification(`🎉 Synced ${updated.length} customer profiles from order records!`);
    } catch (e) {
      console.error('Backfill error:', e);
      showNotification('Notice: Order sync finished with existing records.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter and search logic
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return customers.filter(c => {
      // Search query
      if (q) {
        const nameMatch = (c.name || '').toLowerCase().includes(q);
        const phoneMatch = (c.phone || '').includes(q) || (c.normalizedPhone || '').includes(q);
        const notesMatch = (c.notes || '').toLowerCase().includes(q);
        const tagsMatch = (c.tags || []).some(t => t.toLowerCase().includes(q));
        if (!nameMatch && !phoneMatch && !notesMatch && !tagsMatch) return false;
      }

      // Filter tags
      if (activeFilter === 'vip') {
        return (
          c.tags?.includes('VIP') ||
          c.totalOrders >= 3 ||
          c.totalSpend >= 50000
        );
      }
      if (activeFilter === 'repeat') {
        return c.totalOrders >= 2;
      }
      if (activeFilter === 'new') {
        return c.totalOrders <= 1;
      }
      if (activeFilter === 'delivery') {
        return c.tags?.includes('Delivery') || c.lastOrderType === 'delivery';
      }
      if (activeFilter === 'recent') {
        return (c.lastOrderAt || 0) >= sevenDaysAgo;
      }

      return true;
    });
  }, [customers, searchQuery, activeFilter]);

  // Summary Metrics
  const stats = useMemo(() => {
    const total = customers.length;
    const repeat = customers.filter(c => c.totalOrders >= 2).length;
    const vip = customers.filter(
      c => c.tags?.includes('VIP') || c.totalOrders >= 3 || c.totalSpend >= 50000
    ).length;
    const maxSpend = customers.reduce((max, c) => Math.max(max, c.totalSpend || 0), 0);
    const totalRevenue = customers.reduce((sum, c) => sum + (c.totalSpend || 0), 0);

    return { total, repeat, vip, maxSpend, totalRevenue };
  }, [customers]);

  // Order history for selected customer
  const customerOrders = useMemo(() => {
    if (!selectedCustomer) return [];
    const norm = selectedCustomer.normalizedPhone;
    const rawPhone = normalizePhone(selectedCustomer.phone);
    const custName = (selectedCustomer.name || '').toLowerCase().trim();

    return orders.filter(o => {
      if (o.restaurantId && o.restaurantId !== restaurantId) return false;
      const oNorm = normalizePhone(o.customerPhone);
      if (norm && (oNorm === norm || (rawPhone && oNorm === rawPhone))) return true;
      if (custName && custName !== 'guest' && (o.customerName || '').toLowerCase().trim() === custName) {
        return true;
      }
      return false;
    }).sort((a, b) => (b.createdAtTimestamp || 0) - (a.createdAtTimestamp || 0));
  }, [selectedCustomer, orders, restaurantId]);

  // Helper to determine top favorite dish
  const getTopDish = (c: CustomerProfile): string => {
    if (!c.favoriteItems || Object.keys(c.favoriteItems).length === 0) return '—';
    const entries = Object.entries(c.favoriteItems);
    entries.sort((a, b) => b[1] - a[1]);
    return `${entries[0][0]} (${entries[0][1]}×)`;
  };

  // Save changes from drawer
  const handleSaveDrawer = async () => {
    if (!selectedCustomer) return;
    setIsSavingDrawer(true);
    try {
      const updated: CustomerProfile = {
        ...selectedCustomer,
        name: editName.trim() || selectedCustomer.name,
        notes: editNotes.trim(),
        tags: editTags
      };

      await updateCustomerProfileInCrm(restaurantId, updated);

      setCustomers(prev =>
        prev.map(c => (c.normalizedPhone === updated.normalizedPhone ? updated : c))
      );
      setSelectedCustomer(updated);
      showNotification(`Saved profile for ${updated.name}!`);
    } catch (e) {
      console.error('Save error:', e);
      showNotification('Error saving profile changes');
    } finally {
      setIsSavingDrawer(false);
    }
  };

  // Add tag in drawer
  const handleAddTag = () => {
    const val = newTagInput.trim();
    if (!val) return;
    if (!editTags.includes(val)) {
      setEditTags([...editTags, val]);
    }
    setNewTagInput('');
  };

  // Remove tag in drawer
  const handleRemoveTag = (tagToRemove: string) => {
    setEditTags(editTags.filter(t => t !== tagToRemove));
  };

  // Export CSV for End of Year Giveaways & Marketing
  const handleExportCsv = () => {
    if (customers.length === 0) {
      showNotification('No customer profiles to export yet.');
      return;
    }

    const headers = [
      'Name',
      'Phone Number',
      'Normalized Phone',
      'Total Orders',
      'Total Spend (NGN)',
      'Favorite Dish',
      'Tags',
      'Staff Notes',
      'Last Order Date',
      'First Seen Date'
    ];

    const rows = customers.map(c => [
      `"${(c.name || 'Guest').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${c.normalizedPhone || ''}"`,
      c.totalOrders || 0,
      c.totalSpend || 0,
      `"${getTopDish(c).replace(/"/g, '""')}"`,
      `"${(c.tags || []).join('; ')}"`,
      `"${(c.notes || '').replace(/"/g, '""')}"`,
      c.lastOrderAt ? `"${new Date(c.lastOrderAt).toLocaleDateString()}"` : '""',
      c.createdAt ? `"${new Date(c.createdAt).toLocaleDateString()}"` : '""'
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeRestName = (activeRestaurant?.name || 'Restaurant').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.href = url;
    link.download = `${safeRestName}_Customers_CRM_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification('📥 Customer CRM CSV downloaded! Perfect for giveaways and WhatsApp loyalty.');
  };

  return (
    <div className="space-y-5 pb-16">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 p-4 sm:p-5 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <Users className="w-5 h-5" />
            </span>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
              Customer CRM & Loyalty Hub
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40">
              {stats.total} Diners Captured
            </span>
          </div>
          <p className="text-xs text-neutral-400 max-w-xl">
            Track repeat visitors, reward VIP spenders, send one-tap WhatsApp promo updates, and export full lists for end-of-year giveaways.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleBackfillOrders}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-xl border border-neutral-700 transition-colors shadow-xs"
            title="Scan past orders and update customer metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Past Orders'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 text-xs font-black rounded-xl shadow-md transition-all active:scale-95"
            title="Export full customer list with phone numbers & spend"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-neutral-900/90 border border-neutral-800 p-3.5 sm:p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Total Customers
            </div>
            <div className="text-xl sm:text-2xl font-black text-white mt-1">
              {stats.total.toLocaleString()}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Profiles on file</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-neutral-900/90 border border-neutral-800 p-3.5 sm:p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Repeat Diners
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">
              {stats.repeat.toLocaleString()}
            </div>
            <div className="text-[10px] text-emerald-500/80 mt-0.5">
              {stats.total > 0 ? `${Math.round((stats.repeat / stats.total) * 100)}% retention` : '2+ orders'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-neutral-900/90 border border-neutral-800 p-3.5 sm:p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              VIP Spenders
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-400 mt-1">
              {stats.vip.toLocaleString()}
            </div>
            <div className="text-[10px] text-amber-500/80 mt-0.5">3+ orders or ≥{currencySymbol}50k</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Award className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-neutral-900/90 border border-neutral-800 p-3.5 sm:p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Top Customer Spend
            </div>
            <div className="text-xl sm:text-2xl font-black text-purple-400 mt-1 font-mono">
              {currencySymbol}{stats.maxSpend.toLocaleString()}
            </div>
            <div className="text-[10px] text-purple-400/80 mt-0.5">Highest lifetime total</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Gift className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-900/80 border border-neutral-800 p-3 rounded-xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search diners by name, phone (e.g. 0803...), tag, or notes..."
            className="w-full bg-neutral-950 border border-neutral-800 pl-9 pr-4 py-2 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'all'
                ? 'bg-amber-500 text-neutral-950'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            All ({customers.length})
          </button>
          <button
            onClick={() => setActiveFilter('vip')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 ${
              activeFilter === 'vip'
                ? 'bg-amber-400 text-neutral-950'
                : 'bg-neutral-800 text-amber-300 hover:bg-neutral-750'
            }`}
          >
            <span>🌟 VIP</span>
            <span className="text-[10px] opacity-80">({stats.vip})</span>
          </button>
          <button
            onClick={() => setActiveFilter('repeat')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'repeat'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            🔁 Repeat ({stats.repeat})
          </button>
          <button
            onClick={() => setActiveFilter('new')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'new'
                ? 'bg-emerald-500 text-neutral-950'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            🆕 First Timers
          </button>
          <button
            onClick={() => setActiveFilter('delivery')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'delivery'
                ? 'bg-purple-500 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            🚴 Delivery
          </button>
          <button
            onClick={() => setActiveFilter('recent')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'recent'
                ? 'bg-neutral-100 text-neutral-900'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            📅 Last 7 Days
          </button>
        </div>
      </div>

      {/* Customer List / Table */}
      {filteredCustomers.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mx-auto text-neutral-500">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No customer profiles found</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            {searchQuery
              ? `No diners match "${searchQuery}". Try clearing search filters.`
              : 'Diners who place orders with their phone number or name will be automatically cataloged here.'}
          </p>
          <button
            type="button"
            onClick={handleBackfillOrders}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-xl text-xs transition-colors shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Scan Past Orders for Customers</span>
          </button>
        </div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950 text-neutral-400 uppercase font-semibold border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-3">Phone</th>
                  <th className="py-3 px-3">Tags & Status</th>
                  <th className="py-3 px-3 text-center">Orders</th>
                  <th className="py-3 px-3 text-right">Total Spend</th>
                  <th className="py-3 px-4">Favorite Dish</th>
                  <th className="py-3 px-3">Last Visit</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-neutral-200">
                {filteredCustomers.map(c => {
                  const isVip =
                    c.tags?.includes('VIP') ||
                    c.totalOrders >= 3 ||
                    c.totalSpend >= 50000;
                  const waLink = buildWhatsAppLink(
                    c.phone,
                    `Hello ${c.name || 'valued customer'}, thank you for dining with ${activeRestaurant?.name || 'us'}! 🌟`
                  );

                  return (
                    <tr
                      key={c.id || c.normalizedPhone}
                      onClick={() => setSelectedCustomer(c)}
                      className="hover:bg-neutral-800/50 cursor-pointer transition-colors group"
                    >
                      {/* Customer name & avatar */}
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black uppercase shrink-0 border ${
                            isVip
                              ? 'bg-amber-400 text-neutral-950 border-amber-300'
                              : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                          }`}
                        >
                          {(c.name || 'G')[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="truncate">{c.name || 'Guest Diner'}</span>
                            {isVip && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-400/20 text-amber-300 border border-amber-400/30">
                                VIP
                              </span>
                            )}
                          </div>
                          {c.notes && (
                            <div className="text-[10px] text-neutral-400 truncate max-w-[140px] italic">
                              📝 {c.notes}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-3 font-mono text-neutral-300">
                        {c.phone || <span className="text-neutral-500 italic">No phone</span>}
                      </td>

                      {/* Tags */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1 flex-wrap max-w-[180px]">
                          {(c.tags || []).slice(0, 3).map((tag, ti) => {
                            let tagStyle = 'bg-neutral-800 text-neutral-300 border-neutral-700';
                            if (tag === 'VIP') tagStyle = 'bg-amber-400/20 text-amber-300 border-amber-400/40';
                            if (tag === 'Repeat') tagStyle = 'bg-blue-500/20 text-blue-300 border-blue-500/40';
                            if (tag === 'New') tagStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                            if (tag === 'Delivery') tagStyle = 'bg-purple-500/20 text-purple-300 border-purple-500/40';

                            return (
                              <span
                                key={ti}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${tagStyle}`}
                              >
                                {tag}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Orders */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full font-mono font-bold bg-neutral-800 text-neutral-200">
                          {c.totalOrders}×
                        </span>
                      </td>

                      {/* Total Spend */}
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-amber-400">
                        {currencySymbol}{(c.totalSpend || 0).toLocaleString()}
                      </td>

                      {/* Favorite Dish */}
                      <td className="py-3.5 px-4 text-neutral-300 truncate max-w-[180px]">
                        <span className="text-neutral-300 font-medium">
                          {getTopDish(c)}
                        </span>
                      </td>

                      {/* Last Visit */}
                      <td className="py-3.5 px-3 text-neutral-400 whitespace-nowrap">
                        {c.lastOrderAt ? (
                          <span>{new Date(c.lastOrderAt).toLocaleDateString()}</span>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5" onClick={e => e.stopPropagation()}>
                          {waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-lg border border-emerald-500/30 transition-colors"
                              title="Chat on WhatsApp"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedCustomer(c)}
                            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors group-hover:text-amber-400"
                            title="View Customer Profile"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer Detail Drawer Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs">
          <div className="bg-neutral-900 border-l border-neutral-800 w-full max-w-md h-full overflow-y-auto p-5 space-y-5 text-xs text-neutral-200 shadow-2xl flex flex-col justify-between">
            <div className="space-y-5">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-amber-400 text-neutral-950 font-black flex items-center justify-center text-sm uppercase">
                    {(selectedCustomer.name || 'G')[0]}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">
                      {selectedCustomer.name || 'Guest Diner'}
                    </h3>
                    <div className="text-[11px] text-neutral-400 font-mono">
                      {selectedCustomer.phone || selectedCustomer.normalizedPhone}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick WhatsApp Action */}
              {selectedCustomer.phone && (
                <a
                  href={buildWhatsAppLink(
                    selectedCustomer.phone,
                    `Hello ${selectedCustomer.name || 'there'}! Warm greetings from ${activeRestaurant?.name || 'our kitchen'}. We loved hosting you and would love to hear your feedback or share our latest specials! 🍲`
                  ) || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md transition-all active:scale-98"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Send WhatsApp Message to {selectedCustomer.name || 'Customer'}</span>
                </a>
              )}

              {/* Stats overview */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-neutral-950 border border-neutral-800 p-3 rounded-xl">
                  <div className="text-neutral-400 text-[10px] uppercase font-semibold">Total Orders</div>
                  <div className="text-lg font-black text-white mt-0.5">{selectedCustomer.totalOrders} visits</div>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 p-3 rounded-xl">
                  <div className="text-neutral-400 text-[10px] uppercase font-semibold">Lifetime Spend</div>
                  <div className="text-lg font-black text-amber-400 mt-0.5 font-mono">
                    {currencySymbol}{(selectedCustomer.totalSpend || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Edit Name & Phone */}
              <div className="space-y-3 bg-neutral-950/60 border border-neutral-800 p-3.5 rounded-xl">
                <h4 className="font-bold text-neutral-300 text-xs flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>Edit Profile Details</span>
                </h4>
                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase font-bold mb-1">
                    Customer Full Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 px-3 py-1.5 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                    placeholder="e.g. Chief Adebayo, Sarah M."
                  />
                </div>

                {/* Tags management */}
                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase font-bold mb-1">
                    Tags (VIP, Giveaway 2026, Regular, etc.)
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    {editTags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-neutral-800 text-amber-300 border border-neutral-700 rounded-md text-[11px] font-bold flex items-center gap-1"
                      >
                        <span>{tag}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-red-400"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={e => setNewTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Add tag (e.g. End-of-Year Giveaway)..."
                      className="flex-1 bg-neutral-900 border border-neutral-700 px-2.5 py-1.5 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold rounded-lg text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Staff Notes */}
                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase font-bold mb-1">
                    Staff Private Notes
                  </label>
                  <textarea
                    rows={2}
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="e.g. Prefers spicy stew, always sits at Table 4, VIP guest..."
                    className="w-full bg-neutral-900 border border-neutral-700 px-3 py-1.5 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Past Order History */}
              <div className="space-y-2">
                <h4 className="font-bold text-neutral-300 text-xs flex items-center justify-between">
                  <span>Order History at this Venue</span>
                  <span className="text-[10px] text-neutral-500">{customerOrders.length} records</span>
                </h4>

                {customerOrders.length === 0 ? (
                  <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-500 text-center text-[11px]">
                    No past order tickets found matching this phone number.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {customerOrders.map(o => (
                      <div
                        key={o.id}
                        className="bg-neutral-950 border border-neutral-800/80 p-2.5 rounded-xl space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-white text-[11px]">
                            Ticket #{o.id}
                          </span>
                          <span className="font-mono font-bold text-amber-400">
                            {currencySymbol}{Number(o.total || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-400 flex items-center justify-between">
                          <span>{o.createdAt || 'Recent'}</span>
                          <span className="capitalize">{o.orderType || 'dine_in'}</span>
                        </div>
                        <div className="text-[11px] text-neutral-300 border-t border-neutral-850 pt-1">
                          {(o.items || []).map((it: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-[10px]">
                              <span>
                                {it.quantity}× {it?.foodItem?.name || it?.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Save Profile Button */}
            <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="px-3 py-2 text-neutral-400 hover:text-white rounded-xl text-xs font-bold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveDrawer}
                disabled={isSavingDrawer}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-xl text-xs shadow-md transition-all"
              >
                {isSavingDrawer ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
