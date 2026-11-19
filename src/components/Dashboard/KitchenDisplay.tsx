import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Order } from '../../types';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  PhoneCall,
  Volume2,
  Calendar,
  Printer,
  CheckSquare,
  Square,
  Phone,
  Settings,
  ArrowRight,
  Flame,
  Bell,
  Package,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { playKitchenChime } from '../../utils/audio';
import { getNetworkVerifiedDate, formatNetworkTime, formatNetworkDate } from '../../utils/networkTime';

interface Props {
  onSwitchToManager: () => void;
  shiftData: { isActive: boolean; startedAt: string; startedAtTs: number; endedAt?: string };
  onStartDay: () => void;
  onEndDay: () => void;
  handlePrintTicket: (order: Order) => void;
}

// Helper to safely extract dish name from any order item format
function getItemName(ci: any): string {
  if (!ci) return 'Item';
  return ci.foodItem?.name || ci.name || ci.item?.name || ci.title || 'Item';
}

// Helper to safely extract dish price from any order item format
function getItemPrice(ci: any): number {
  if (!ci) return 0;
  return Number(ci.foodItem?.price ?? ci.price ?? ci.item?.price ?? 0);
}

function useTicketAge(order: Order, _tick: number) {
  const ts = order.createdAtTimestamp || Date.now();
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 10) return { label: `${mins}m`, urgency: 'ok' as const };
  if (mins < 20) return { label: `${mins}m`, urgency: 'warning' as const };
  return { label: `${mins}m ⚠`, urgency: 'urgent' as const };
}

const STATUS_COLS = [
  { key: 'pending',   label: 'New Orders',   icon: Bell,         color: 'border-rose-500',   headerBg: 'bg-rose-500',   dot: 'bg-rose-400',   badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  { key: 'preparing', label: 'Cooking',      icon: Flame,        color: 'border-amber-400',  headerBg: 'bg-amber-400',  dot: 'bg-amber-400',  badgeBg: 'bg-amber-400/20 text-amber-300 border-amber-400/40' },
  { key: 'ready',     label: 'Ready to Serve', icon: CheckCircle2, color: 'border-emerald-400',headerBg: 'bg-emerald-500',dot: 'bg-emerald-400',badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'},
] as const;

type KDSStatus = 'pending' | 'preparing' | 'ready';
type MobileTab = KDSStatus | 'served';

// ── Individual Ticket Card ──────────────────────────────────────────────────
const TicketCard: React.FC<{
  order: Order;
  tick: number;
  checkedItems: Record<string, boolean>;
  onToggleItem: (key: string) => void;
  onStatus: (id: string, status: Order['status']) => void;
  onPrint: (order: Order) => void;
  currencySymbol: string;
}> = ({ order, tick, checkedItems, onToggleItem, onStatus, onPrint, currencySymbol }) => {
  const age = useTicketAge(order, tick);
  const isUrgent = age.urgency === 'urgent';
  const isWarning = age.urgency === 'warning';

  const nextStatus: Order['status'] =
    order.status === 'pending' ? 'preparing' :
    order.status === 'preparing' ? 'ready' :
    'served';

  const nextLabel =
    order.status === 'pending' ? '▶ Start Cooking' :
    order.status === 'preparing' ? '✓ Mark Ready' :
    '✓ Mark as Served';

  const nextBg =
    order.status === 'pending' ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 active:bg-amber-300' :
    order.status === 'preparing' ? 'bg-emerald-500 hover:bg-emerald-400 text-white active:bg-emerald-600' :
    'bg-blue-500 hover:bg-blue-400 text-white active:bg-blue-600';

  const hasTakeout = order.orderType === 'takeaway' || order.orderType === 'both';
  const rawItems = Array.isArray(order.items) ? order.items : [];

  return (
    <div className={`bg-neutral-850 rounded-2xl flex flex-col border-l-4 overflow-hidden shadow-lg transition-all border border-neutral-700/50 ${
      isUrgent  ? 'border-l-red-500 ring-1 ring-red-500/50 bg-neutral-900' :
      isWarning ? 'border-l-amber-400 bg-neutral-900' :
                  'border-l-neutral-600 bg-neutral-800'
    }`}>
      {/* Card Header */}
      <div className="px-3.5 sm:px-4 pt-3.5 pb-2.5 flex items-start justify-between gap-2 border-b border-neutral-700/40">
        <div className="min-w-0 flex-1">
          {/* Table + order ID */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 bg-white text-neutral-950 font-black font-mono text-sm sm:text-base rounded-xl leading-none shadow-sm">
              {order.tableNumber || 'Table'}
            </span>
            <span className="text-neutral-400 font-mono text-xs">#{order.id}</span>
            <span className="text-[10px] text-neutral-400 font-semibold px-2 py-0.5 rounded-md bg-neutral-700/60">
              {order.source === 'nfc' ? '📱 NFC' : '📷 QR'}
            </span>
          </div>

          {/* Takeout badge */}
          {hasTakeout && (
            <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1 bg-rose-950/80 border border-rose-500/80 rounded-xl text-xs font-black text-rose-300 w-fit">
              <Package className="w-3.5 h-3.5 text-rose-400" />
              <span>{order.orderType === 'both' ? 'DINE-IN + TAKEOUT' : 'TAKEOUT'}</span>
              {order.packCount ? <span>({order.packCount}x packs)</span> : null}
            </div>
          )}

          {/* Customer */}
          <div className="text-sm text-white font-bold mt-2 flex flex-wrap items-center gap-2">
            <span className="truncate">{order.customerName || 'Guest Diner'}</span>
            {order.customerPhone && (
              <a
                href={`tel:${order.customerPhone}`}
                className="flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-lg border border-amber-400/20 active:scale-95 transition-transform"
              >
                <Phone className="w-3 h-3" />
                <span>{order.customerPhone}</span>
              </a>
            )}
          </div>
          <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-1.5 font-mono">
            <span>Ordered: {order.createdAt || 'Just now'}</span>
          </div>
        </div>

        {/* Age + print */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`px-2.5 py-1 rounded-xl font-mono text-xs font-black flex items-center gap-1 shadow-sm ${
            isUrgent  ? 'bg-red-500 text-white animate-pulse' :
            isWarning ? 'bg-amber-400 text-neutral-950' :
                        'bg-neutral-700 text-neutral-200'
          }`}>
            <Clock className="w-3.5 h-3.5" />
            {age.label}
          </span>
          <button
            onClick={() => onPrint(order)}
            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-xl transition-colors active:scale-95"
            title="Print receipt ticket"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Items checklist */}
      <div className="px-3.5 sm:px-4 py-2.5 space-y-1.5 flex-1">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1 px-1">
          <span>Dish Checklist ({rawItems.length})</span>
          <span className="text-[10px] text-neutral-500">Tap to cross off</span>
        </div>
        {rawItems.map((ci, idx) => {
          if (!ci) return null;
          const key = `${order.id}-${idx}`;
          const checked = !!checkedItems[key];
          const isItemTakeout = ci.itemType === 'takeaway';
          const name = getItemName(ci);
          const price = getItemPrice(ci);
          const qty = Number(ci.quantity) || 1;

          return (
            <div
              key={idx}
              onClick={() => onToggleItem(key)}
              className={`flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all select-none border ${
                checked
                  ? 'bg-neutral-900/60 border-neutral-800 text-neutral-500'
                  : 'bg-neutral-750/70 hover:bg-neutral-700 border-neutral-700/60 text-white'
              }`}
            >
              {checked
                ? <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                : <Square className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
              }
              <div className={`flex-1 min-w-0 ${checked ? 'opacity-40 line-through' : ''}`}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono font-black text-amber-400 text-xs sm:text-sm">{qty}×</span>
                  <span className="font-bold text-sm leading-snug">{name}</span>
                  {isItemTakeout && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1">
                      <Package className="w-2.5 h-2.5" /> Takeout
                    </span>
                  )}
                  {!isItemTakeout && ci.itemType === 'dine_in' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 inline-flex items-center gap-1">
                      <UtensilsCrossed className="w-2.5 h-2.5" /> Dine-in
                    </span>
                  )}
                </div>
                {ci.notes && (
                  <div className="text-xs text-amber-300 bg-amber-400/15 border border-amber-400/30 px-2 py-1 rounded-lg mt-1 italic font-medium">
                    📝 Note: {ci.notes}
                  </div>
                )}
              </div>
              <span className={`font-mono text-xs shrink-0 font-semibold ${checked ? 'text-neutral-600 line-through' : 'text-neutral-300'}`}>
                {currencySymbol}{(price * qty).toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer: total + action */}
      <div className="px-3.5 sm:px-4 pb-4 pt-3 border-t border-neutral-700/60 space-y-2.5 bg-neutral-900/40">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span>Order Total</span>
          <span className="font-mono font-black text-white text-base">
            {currencySymbol}{Number(order.total || 0).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-neutral-400">
          <span>Payment</span>
          <span className="font-bold text-neutral-200 px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700">
            {order.paymentMethod === 'pos' ? '💳 Card/POS' :
             order.paymentMethod === 'cash' ? '💵 Cash' :
             order.paymentMethod === 'transfer' ? '🏦 Bank Transfer' : '💳 Card/POS'}
          </span>
        </div>

        {/* Large touch-friendly action button */}
        <button
          onClick={() => onStatus(order.id, nextStatus)}
          className={`w-full py-3.5 sm:py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all ${nextBg}`}
        >
          <span>{nextLabel}</span>
        </button>
      </div>
    </div>
  );
};

// ── Main Kitchen Display ────────────────────────────────────────────────────
export const KitchenDisplay: React.FC<Props> = ({
  onSwitchToManager,
  shiftData,
  onStartDay,
  onEndDay,
  handlePrintTicket,
}) => {
  const {
    orders,
    updateOrderStatus,
    waiterCalls,
    resolveWaiterCall,
    activeRestaurant,
  } = useApp();

  const [tick, setTick] = useState(0);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [testingChime, setTestingChime] = useState(false);
  const [liveClock, setLiveClock] = useState(() => formatNetworkTime());
  const [liveDate, setLiveDate] = useState(() => formatNetworkDate());
  
  // Mobile tab selection: defaults to pending
  const [mobileTab, setMobileTab] = useState<MobileTab>('pending');

  const currencySymbol = activeRestaurant?.design?.currencySymbol || '₦';
  const restaurantName = activeRestaurant?.name || 'Kitchen';

  useEffect(() => {
    const t = setInterval(() => {
      setTick(n => n + 1);
      const d = getNetworkVerifiedDate();
      setLiveClock(formatNetworkTime(d));
      setLiveDate(formatNetworkDate(d));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const restaurantCalls = (waiterCalls || []).filter(c =>
    c.restaurantId === activeRestaurant?.id || !c.restaurantId
  );

  // Filter to today's shift orders
  const shiftStart = shiftData.startedAtTs || 0;
  const todayOrders = (orders || []).filter(o =>
    (o.createdAtTimestamp || 0) >= shiftStart || !o.createdAtTimestamp
  );

  const byStatus = (s: KDSStatus) => todayOrders.filter(o => o.status === s);
  const servedToday = todayOrders.filter(o => o.status === 'served');
  const totalRevenue = servedToday.reduce((s, o) => s + (Number(o.total) || 0), 0);
  
  const pendingOrders = byStatus('pending');
  const preparingOrders = byStatus('preparing');
  const readyOrders = byStatus('ready');
  const activeCount = pendingOrders.length + preparingOrders.length + readyOrders.length;

  const handleTestChime = () => {
    setTestingChime(true);
    playKitchenChime();
    setTimeout(() => setTestingChime(false), 1200);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col font-sans select-none">

      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2.5 shrink-0 sticky top-0 z-20 shadow-md">
        {/* Left: brand + clock */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ChefHat className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="font-black text-xs sm:text-sm text-white truncate max-w-[120px] sm:max-w-[200px]">
              {restaurantName}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-950 rounded-xl font-mono text-xs font-black text-emerald-400 border border-neutral-800 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {liveClock}
          </div>
          <span className="text-neutral-500 text-xs hidden lg:block">{liveDate}</span>
        </div>

        {/* Centre: stats */}
        <div className="flex items-center gap-2 text-xs font-bold shrink-0">
          {activeCount > 0 && (
            <span className="px-2.5 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-full font-mono text-[11px] sm:text-xs">
              {activeCount} active
            </span>
          )}
          <span className="px-2.5 py-1 bg-neutral-800 text-neutral-300 rounded-full font-mono text-xs hidden sm:block">
            {servedToday.length} served · {currencySymbol}{totalRevenue.toLocaleString()}
          </span>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={handleTestChime}
            className={`p-2 rounded-xl transition-all active:scale-95 ${
              testingChime ? 'bg-amber-500 text-neutral-950' : 'bg-neutral-800 text-neutral-400 hover:text-amber-400 border border-neutral-700'
            }`}
            title="Test buzzer"
          >
            <Volume2 className="w-4 h-4" />
          </button>

          {/* Day shift toggle */}
          {shiftData.isActive ? (
            <button
              onClick={onEndDay}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-neutral-700 active:scale-95"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">End Day</span>
            </button>
          ) : (
            <button
              onClick={onStartDay}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Start Day</span>
            </button>
          )}

          {/* Switch to manager mode */}
          <button
            onClick={onSwitchToManager}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-xs font-black transition-all shadow-md active:scale-95"
            title="Switch to Manager View (Menu, Inventory, Tables)"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Manager</span>
            <ArrowRight className="w-3.5 h-3.5 hidden sm:inline" />
          </button>
        </div>
      </header>

      {/* ── Waiter Call Banner ───────────────────────────────────── */}
      {restaurantCalls.length > 0 && (
        <div className="bg-amber-500 text-neutral-950 px-3.5 py-2.5 flex items-center justify-between gap-3 shrink-0 animate-pulse">
          <div className="flex items-center gap-2 font-black text-xs sm:text-sm min-w-0">
            <PhoneCall className="w-4 h-4 sm:w-5 sm:h-5 animate-bounce shrink-0" />
            <span className="truncate">
              🛎️ Waiter: {restaurantCalls.map(c => `${c.tableNumber} (${c.reason || 'Service'})`).join(' · ')}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {restaurantCalls.map(c => (
              <button
                key={c.id}
                onClick={() => resolveWaiterCall(c.id)}
                className="flex items-center gap-1 px-2.5 py-1 bg-neutral-950 text-white rounded-lg text-xs font-black hover:bg-neutral-800 transition-colors"
              >
                <X className="w-3 h-3" />
                <span>{c.tableNumber}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Mobile Segmented Control Tabs (Full Width on Phone) ── */}
      <div className="md:hidden bg-neutral-900 border-b border-neutral-800 px-2 py-2 sticky top-[49px] z-10 shrink-0">
        <div className="grid grid-cols-4 gap-1.5 p-1 bg-neutral-950 rounded-xl border border-neutral-800">
          <button
            onClick={() => setMobileTab('pending')}
            className={`py-2 px-1 rounded-lg text-xs font-black flex flex-col items-center justify-center transition-all ${
              mobileTab === 'pending'
                ? 'bg-rose-500 text-white shadow-md'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <div className="flex items-center gap-1">
              <Bell className="w-3.5 h-3.5" />
              <span>New</span>
            </div>
            <span className={`text-[10px] font-mono mt-0.5 px-1.5 py-0.2 rounded-full ${
              mobileTab === 'pending' ? 'bg-black/30 text-white' : 'bg-neutral-800 text-rose-400'
            }`}>
              {pendingOrders.length}
            </span>
          </button>

          <button
            onClick={() => setMobileTab('preparing')}
            className={`py-2 px-1 rounded-lg text-xs font-black flex flex-col items-center justify-center transition-all ${
              mobileTab === 'preparing'
                ? 'bg-amber-400 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <div className="flex items-center gap-1">
              <Flame className="w-3.5 h-3.5" />
              <span>Cook</span>
            </div>
            <span className={`text-[10px] font-mono mt-0.5 px-1.5 py-0.2 rounded-full ${
              mobileTab === 'preparing' ? 'bg-black/20 text-neutral-950' : 'bg-neutral-800 text-amber-400'
            }`}>
              {preparingOrders.length}
            </span>
          </button>

          <button
            onClick={() => setMobileTab('ready')}
            className={`py-2 px-1 rounded-lg text-xs font-black flex flex-col items-center justify-center transition-all ${
              mobileTab === 'ready'
                ? 'bg-emerald-500 text-white shadow-md'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Ready</span>
            </div>
            <span className={`text-[10px] font-mono mt-0.5 px-1.5 py-0.2 rounded-full ${
              mobileTab === 'ready' ? 'bg-black/30 text-white' : 'bg-neutral-800 text-emerald-400'
            }`}>
              {readyOrders.length}
            </span>
          </button>

          <button
            onClick={() => setMobileTab('served')}
            className={`py-2 px-1 rounded-lg text-xs font-black flex flex-col items-center justify-center transition-all ${
              mobileTab === 'served'
                ? 'bg-neutral-700 text-white shadow-md'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <div className="flex items-center gap-1">
              <Package className="w-3.5 h-3.5" />
              <span>Served</span>
            </div>
            <span className={`text-[10px] font-mono mt-0.5 px-1.5 py-0.2 rounded-full ${
              mobileTab === 'served' ? 'bg-black/30 text-white' : 'bg-neutral-800 text-neutral-300'
            }`}>
              {servedToday.length}
            </span>
          </button>
        </div>
      </div>

      {/* ── Main Kanban Columns Layout ───────────────────────────── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* ── Mobile Single Column Active View ── */}
        <div className="flex-1 md:hidden flex flex-col overflow-y-auto p-3 space-y-3 pb-36 min-h-0">
          {mobileTab === 'served' ? (
            /* Mobile Served view */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400 font-bold px-1 py-1">
                <span>Completed Orders Today</span>
                <span className="font-mono text-emerald-400">{currencySymbol}{totalRevenue.toLocaleString()}</span>
              </div>
              {servedToday.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-neutral-500 text-xs font-semibold">
                  <CheckCircle2 className="w-10 h-10 mb-2 opacity-30 text-neutral-600" />
                  <span>No completed orders yet today</span>
                </div>
              ) : (
                servedToday.map(o => (
                  <div key={o.id} className="p-3 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-white">{o.tableNumber}</span>
                        <span className="text-[10px] text-neutral-500 font-mono">#{o.id}</span>
                      </div>
                      <div className="text-xs text-neutral-400 mt-0.5 truncate">{o.customerName}</div>
                      <div className="text-[10px] text-neutral-500">{o.createdAt}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-black text-sm text-emerald-400">{currencySymbol}{Number(o.total || 0).toLocaleString()}</div>
                      <span className="text-[10px] text-neutral-400 uppercase font-bold">{o.paymentMethod || 'Card'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Mobile Active Tickets view */
            (() => {
              const currentOrders = byStatus(mobileTab);
              const colConfig = STATUS_COLS.find(c => c.key === mobileTab);
              const ColIcon = colConfig?.icon || Bell;

              if (currentOrders.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-20 text-neutral-500 text-xs font-semibold text-center">
                    <ColIcon className="w-12 h-12 mb-3 opacity-30 text-neutral-600" />
                    <span className="text-sm font-bold text-neutral-400">No {colConfig?.label.toLowerCase() || 'orders'}</span>
                    <span className="text-[11px] text-neutral-600 mt-1">New incoming tickets will ring here automatically</span>
                  </div>
                );
              }

              return currentOrders.map(order => (
                <TicketCard
                  key={order.id}
                  order={order}
                  tick={tick}
                  checkedItems={checkedItems}
                  onToggleItem={key => setCheckedItems(p => ({ ...p, [key]: !p[key] }))}
                  onStatus={updateOrderStatus}
                  onPrint={handlePrintTicket}
                  currencySymbol={currencySymbol}
                />
              ));
            })()
          )}
        </div>

        {/* ── Desktop Multi-Column Kanban Board (md:flex) ── */}
        <div className="hidden md:flex flex-1 gap-0 overflow-hidden">
          {STATUS_COLS.map((col) => {
            const colOrders = byStatus(col.key as KDSStatus);
            const ColIcon = col.icon;

            return (
              <div
                key={col.key}
                className="flex-1 flex flex-col border-r border-neutral-800 last:border-r-0 min-w-0"
              >
                {/* Column header */}
                <div className={`${col.headerBg} px-4 py-2.5 flex items-center justify-between shrink-0 shadow-sm`}>
                  <div className="flex items-center gap-2 text-neutral-950 font-black text-sm">
                    <ColIcon className="w-4 h-4" />
                    <span>{col.label}</span>
                  </div>
                  {colOrders.length > 0 && (
                    <span className="bg-neutral-950/20 text-neutral-950 font-mono font-black text-xs px-2.5 py-0.5 rounded-full">
                      {colOrders.length}
                    </span>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 pb-4">
                  {colOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-44 text-neutral-600 text-xs font-semibold">
                      <ColIcon className="w-9 h-9 mb-2 opacity-30" />
                      <span>No {col.label.toLowerCase()}</span>
                    </div>
                  ) : (
                    colOrders.map(order => (
                      <TicketCard
                        key={order.id}
                        order={order}
                        tick={tick}
                        checkedItems={checkedItems}
                        onToggleItem={key => setCheckedItems(p => ({ ...p, [key]: !p[key] }))}
                        onStatus={updateOrderStatus}
                        onPrint={handlePrintTicket}
                        currencySymbol={currencySymbol}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}

          {/* Desktop Served sidebar column */}
          <div className="hidden lg:flex flex-col border-l border-neutral-800 w-64 shrink-0 bg-neutral-900/60">
            <div className="bg-neutral-800 px-4 py-2.5 flex items-center justify-between shrink-0 border-b border-neutral-700">
              <div className="flex items-center gap-2 text-neutral-300 font-black text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Served Today</span>
              </div>
              {servedToday.length > 0 && (
                <span className="bg-neutral-700 text-emerald-400 font-mono text-xs px-2 py-0.5 rounded-full font-bold">
                  {servedToday.length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1.5">
              {servedToday.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-36 text-neutral-600 text-xs font-semibold">
                  <CheckCircle2 className="w-7 h-7 mb-1 opacity-30" />
                  <span>None yet</span>
                </div>
              ) : (
                servedToday.map(o => (
                  <div key={o.id} className="p-2.5 bg-neutral-850/80 rounded-xl border border-neutral-800 hover:border-neutral-700 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-xs text-white">{o.tableNumber}</span>
                      <span className="font-mono text-xs text-emerald-400 font-bold">
                        {currencySymbol}{Number(o.total || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate mt-0.5">{o.customerName}</div>
                    <div className="text-[10px] text-neutral-500 font-mono flex items-center justify-between mt-1">
                      <span>{o.createdAt}</span>
                      <span className="uppercase">{o.paymentMethod || 'Card'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
