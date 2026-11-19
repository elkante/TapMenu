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

function useTicketAge(order: Order, tick: number) {
  const ts = order.createdAtTimestamp || Date.now();
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 10) return { label: `${mins}m`, urgency: 'ok' as const };
  if (mins < 20) return { label: `${mins}m`, urgency: 'warning' as const };
  return { label: `${mins}m ⚠`, urgency: 'urgent' as const };
}

const STATUS_COLS = [
  { key: 'pending',   label: 'New Orders',   icon: Bell,            color: 'border-rose-500',   headerBg: 'bg-rose-500',  dot: 'bg-rose-400'   },
  { key: 'preparing', label: 'Cooking',       icon: Flame,           color: 'border-amber-400',  headerBg: 'bg-amber-400', dot: 'bg-amber-400'  },
  { key: 'ready',     label: 'Ready to Serve',icon: CheckCircle2,    color: 'border-emerald-400',headerBg: 'bg-emerald-500',dot: 'bg-emerald-400'},
] as const;

type KDSStatus = 'pending' | 'preparing' | 'ready';

// ── Individual Ticket Card ──────────────────────────────────────────────────
const TicketCard: React.FC<{
  order: Order;
  tick: number;
  checkedItems: Record<string, boolean>;
  onToggleItem: (key: string) => void;
  onStatus: (id: string, status: Order['status']) => void;
  onPrint: (order: Order) => void;
  currencySymbol: string;
  onResolveCall?: (id: string) => void;
  waiterCallId?: string;
}> = ({ order, tick, checkedItems, onToggleItem, onStatus, onPrint, currencySymbol, onResolveCall, waiterCallId }) => {
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
    '✓ Served';

  const nextBg =
    order.status === 'pending' ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950' :
    order.status === 'preparing' ? 'bg-emerald-500 hover:bg-emerald-400 text-white' :
    'bg-blue-500 hover:bg-blue-400 text-white';

  const hasTakeout = order.orderType === 'takeaway' || order.orderType === 'both';

  return (
    <div className={`bg-neutral-800 rounded-2xl flex flex-col border-l-4 overflow-hidden transition-all ${
      isUrgent  ? 'border-l-red-500 ring-1 ring-red-500/40' :
      isWarning ? 'border-l-amber-400' :
                  'border-l-neutral-600'
    }`}>
      {/* Card Header */}
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Table + order ID */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 bg-white text-neutral-950 font-black font-mono text-base rounded-lg leading-none">
              {order.tableNumber}
            </span>
            <span className="text-neutral-500 font-mono text-[11px]">#{order.id}</span>
            <span className="text-[10px] text-neutral-500 font-semibold">
              {order.source === 'nfc' ? '📱 NFC' : '📷 QR'}
            </span>
          </div>

          {/* Takeout badge */}
          {hasTakeout && (
            <div className="mt-1.5 flex items-center gap-1 px-2 py-0.5 bg-rose-900/60 border border-rose-500/60 rounded-lg text-[11px] font-black text-rose-300 w-fit animate-pulse">
              {order.orderType === 'both' ? '🍽️🥡 DINE-IN + TAKEOUT' : '🥡 TAKEOUT'}
              {order.packCount && <span> ({order.packCount}x packs)</span>}
            </div>
          )}

          {/* Customer */}
          <div className="text-sm text-white font-bold mt-1 flex flex-wrap items-center gap-2">
            <span className="truncate">{order.customerName}</span>
            {order.customerPhone && (
              <a
                href={`tel:${order.customerPhone}`}
                className="flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md"
              >
                <Phone className="w-3 h-3" />
                {order.customerPhone}
              </a>
            )}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Placed {order.createdAt}</div>
        </div>

        {/* Age + print */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`px-2 py-0.5 rounded-lg font-mono text-xs font-black flex items-center gap-1 ${
            isUrgent  ? 'bg-red-500 text-white animate-pulse' :
            isWarning ? 'bg-amber-400 text-neutral-950' :
                        'bg-neutral-700 text-neutral-300'
          }`}>
            <Clock className="w-3 h-3" />
            {age.label}
          </span>
          <button
            onClick={() => onPrint(order)}
            className="p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
            title="Print slip"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Items checklist */}
      <div className="px-4 py-2 space-y-1.5 border-t border-neutral-700/60 flex-1">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
          <span>Items</span>
          <span>Tap to tick off</span>
        </div>
        {order.items.map((ci, idx) => {
          const key = `${order.id}-${idx}`;
          const checked = !!checkedItems[key];
          const isItemTakeout = ci.itemType === 'takeaway';
          return (
            <div
              key={idx}
              onClick={() => onToggleItem(key)}
              className={`flex items-start gap-2.5 p-2 rounded-xl cursor-pointer transition-all select-none ${
                checked ? 'bg-neutral-700/40' : 'bg-neutral-700/60 hover:bg-neutral-700'
              }`}
            >
              {checked
                ? <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                : <Square className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
              }
              <div className={`flex-1 min-w-0 ${checked ? 'opacity-40 line-through' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-black text-amber-400 text-xs">{ci.quantity}×</span>
                  <span className="font-bold text-white text-sm">{ci.foodItem.name}</span>
                  {isItemTakeout && <Package className="w-3 h-3 text-rose-400 shrink-0" title="Takeout" />}
                  {!isItemTakeout && ci.itemType === 'dine_in' && <UtensilsCrossed className="w-3 h-3 text-blue-400 shrink-0" title="Dine-in" />}
                </div>
                {ci.notes && (
                  <div className="text-[11px] text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded mt-0.5 italic">
                    📝 {ci.notes}
                  </div>
                )}
              </div>
              <span className={`font-mono text-xs shrink-0 ${checked ? 'text-neutral-600 line-through' : 'text-neutral-400'}`}>
                {currencySymbol}{(ci.foodItem.price * ci.quantity).toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer: total + action */}
      <div className="px-4 pb-4 pt-3 border-t border-neutral-700/60 space-y-2">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span>Total</span>
          <span className="font-mono font-black text-white text-sm">{currencySymbol}{order.total.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-neutral-500">
          <span>Payment</span>
          <span className="font-semibold text-neutral-300">
            {order.paymentMethod === 'pos' ? '💳 Card/POS' :
             order.paymentMethod === 'cash' ? '💵 Cash' :
             order.paymentMethod === 'transfer' ? '🏦 Transfer' : '💳 Card/POS'}
          </span>
        </div>

        <button
          onClick={() => onStatus(order.id, nextStatus)}
          className={`w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 ${nextBg}`}
        >
          {nextLabel}
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
  const [focusedCol, setFocusedCol] = useState<KDSStatus | null>(null);

  const design = activeRestaurant.design;

  useEffect(() => {
    const t = setInterval(() => {
      setTick(n => n + 1);
      const d = getNetworkVerifiedDate();
      setLiveClock(formatNetworkTime(d));
      setLiveDate(formatNetworkDate(d));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const restaurantCalls = waiterCalls.filter(c =>
    c.restaurantId === activeRestaurant.id || !c.restaurantId
  );

  // Filter to today's shift
  const shiftStart = shiftData.startedAtTs || 0;
  const todayOrders = orders.filter(o =>
    (o.createdAtTimestamp || 0) >= shiftStart || !o.createdAtTimestamp
  );

  const byStatus = (s: KDSStatus) => todayOrders.filter(o => o.status === s);
  const servedToday = todayOrders.filter(o => o.status === 'served');
  const totalRevenue = servedToday.reduce((s, o) => s + (o.total || 0), 0);
  const activeCount = byStatus('pending').length + byStatus('preparing').length + byStatus('ready').length;

  const handleTestChime = () => {
    setTestingChime(true);
    playKitchenChime();
    setTimeout(() => setTestingChime(false), 1200);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">

      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between gap-3 shrink-0">
        {/* Left: brand + clock */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="font-black text-sm text-white truncate hidden sm:block">{activeRestaurant.name}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-neutral-950 rounded-xl font-mono text-xs font-black text-emerald-400 border border-neutral-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {liveClock}
          </div>
          <span className="text-neutral-600 text-xs hidden md:block">{liveDate}</span>
        </div>

        {/* Centre: stats */}
        <div className="flex items-center gap-2 text-xs font-bold">
          {activeCount > 0 && (
            <span className="px-3 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-full font-mono">
              {activeCount} active
            </span>
          )}
          <span className="px-3 py-1 bg-neutral-800 text-neutral-300 rounded-full font-mono hidden sm:block">
            {servedToday.length} served · {design.currencySymbol}{totalRevenue.toLocaleString()}
          </span>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleTestChime}
            className={`p-2 rounded-xl transition-all ${testingChime ? 'bg-amber-500 text-neutral-950' : 'bg-neutral-800 text-neutral-400 hover:text-amber-400'}`}
            title="Test buzzer"
          >
            <Volume2 className="w-4 h-4" />
          </button>

          {/* Day shift */}
          {shiftData.isActive ? (
            <button
              onClick={onEndDay}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-neutral-700"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">End Day</span>
            </button>
          ) : (
            <button
              onClick={onStartDay}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Start Day</span>
            </button>
          )}

          {/* Switch to manager mode */}
          <button
            onClick={onSwitchToManager}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-xs font-black transition-all shadow-md active:scale-95"
            title="Switch to Manager Mode (Menu, Inventory, Expenses, Tables, Settings)"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Manager</span>
            <ArrowRight className="w-3.5 h-3.5 hidden sm:inline" />
          </button>
        </div>
      </header>

      {/* ── Waiter Call Banner ───────────────────────────────────── */}
      {restaurantCalls.length > 0 && (
        <div className="bg-amber-500 text-neutral-950 px-4 py-2.5 flex items-center justify-between gap-4 shrink-0 animate-pulse">
          <div className="flex items-center gap-2 font-black text-sm">
            <PhoneCall className="w-5 h-5 animate-bounce shrink-0" />
            <span>
              🛎️ {restaurantCalls.map(c => `${c.tableNumber} (${c.reason || 'Service'})`).join(' · ')}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {restaurantCalls.map(c => (
              <button
                key={c.id}
                onClick={() => resolveWaiterCall(c.id)}
                className="flex items-center gap-1 px-3 py-1 bg-neutral-950 text-white rounded-lg text-xs font-black hover:bg-neutral-800 transition-colors"
              >
                <X className="w-3 h-3" />
                {c.tableNumber}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Kanban Columns ───────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column tabs on mobile */}
        <div className="flex md:hidden overflow-x-auto shrink-0 bg-neutral-900 border-b border-neutral-800 px-3 gap-2 py-2">
          {STATUS_COLS.map(col => {
            const count = byStatus(col.key as KDSStatus).length;
            return (
              <button
                key={col.key}
                onClick={() => setFocusedCol(focusedCol === col.key ? null : col.key as KDSStatus)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
                  focusedCol === col.key ? col.headerBg + ' text-neutral-950' : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                {col.label}
                {count > 0 && (
                  <span className="bg-neutral-950/30 text-current px-1.5 rounded-full font-mono">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Columns */}
        <div className="flex-1 flex gap-0 overflow-hidden">
          {STATUS_COLS.map((col, ci) => {
            const colOrders = byStatus(col.key as KDSStatus);
            const ColIcon = col.icon;
            const isHiddenMobile = focusedCol !== null && focusedCol !== col.key;

            return (
              <div
                key={col.key}
                className={`flex flex-col border-r border-neutral-800 last:border-r-0 transition-all ${
                  isHiddenMobile ? 'hidden md:flex' : 'flex'
                } ${focusedCol === col.key ? 'flex-1' : 'md:flex-1'}`}
                style={{ minWidth: 0 }}
              >
                {/* Column header */}
                <div className={`${col.headerBg} px-4 py-2.5 flex items-center justify-between shrink-0`}>
                  <div className="flex items-center gap-2 text-neutral-950 font-black text-sm">
                    <ColIcon className="w-4 h-4" />
                    <span>{col.label}</span>
                  </div>
                  {colOrders.length > 0 && (
                    <span className="bg-neutral-950/20 text-neutral-950 font-mono font-black text-xs px-2 py-0.5 rounded-full">
                      {colOrders.length}
                    </span>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 pb-28 md:pb-3">
                  {colOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-neutral-700 text-xs font-semibold">
                      <ColIcon className="w-8 h-8 mb-2 opacity-30" />
                      No {col.label.toLowerCase()}
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
                        currencySymbol={design.currencySymbol}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}

          {/* Served column — compact list */}
          <div className={`hidden lg:flex flex-col border-l border-neutral-800 w-56 shrink-0`}>
            <div className="bg-neutral-800 px-4 py-2.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-neutral-400 font-black text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Served</span>
              </div>
              {servedToday.length > 0 && (
                <span className="bg-neutral-700 text-neutral-300 font-mono text-xs px-2 py-0.5 rounded-full">
                  {servedToday.length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {servedToday.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 text-neutral-700 text-xs font-semibold">
                  <CheckCircle2 className="w-6 h-6 mb-1 opacity-30" />
                  None yet
                </div>
              ) : (
                servedToday.map(o => (
                  <div key={o.id} className="px-3 py-2 border-b border-neutral-800/60 hover:bg-neutral-800/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-xs text-neutral-300">{o.tableNumber}</span>
                      <span className="font-mono text-xs text-emerald-400">{design.currencySymbol}{o.total.toLocaleString()}</span>
                    </div>
                    <div className="text-[11px] text-neutral-600 truncate">{o.customerName}</div>
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
