import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  ShoppingBag,
  X,
  Trash2,
  CreditCard,
  Coins,
  CheckCircle2,
  ArrowRight,
  Plus,
  Minus,
  Building2,
  UtensilsCrossed,
  Package,
  Zap,
  MapPin,
  Bike,
  Upload
} from 'lucide-react';
import { compressImageToDataUrl } from '../utils/supabase';

export const CustomerCartDrawer: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const {
    cart,
    updateCartItemQuantity,
    updateCartItemType,
    updateCartItemNotes,
    setAllCartItemsType,
    removeFromCart,
    placeOrder,
    activeRestaurant,
    currentTable,
    isNfcSource,
    showNotification
  } = useApp();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [packCount, setPackCount] = useState(1);
  const [paymentChoice, setPaymentChoice] = useState<'pos' | 'cash' | 'transfer'>('pos');
  const [paymentProofUrl, setPaymentProofUrl] = useState<string>('');
  const [hasPaidClicked, setHasPaidClicked] = useState(false);
  const [orderPlacedSuccess, setOrderPlacedSuccess] = useState<string | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  // Top-level order mode — the most visible choice the customer makes
  const [topOrderMode, setTopOrderMode] = useState<'dine_in' | 'takeaway' | 'delivery'>(
    () => !currentTable ? 'takeaway' : 'dine_in'
  );

  if (!isOpen) return null;

  const isCounterMode = (activeRestaurant as any).serviceMode === 'counter_only' || (activeRestaurant as any).plan === 'vendor';
  const design = activeRestaurant.design;
  const packUnitPrice = activeRestaurant.packagingFeePerPack ?? 500;
  const deliveryUnitPrice = activeRestaurant.deliveryFee ?? 1000;

  const isDelivery = topOrderMode === 'delivery';
  const isTakeout  = topOrderMode === 'takeaway' || isDelivery;
  const orderType  = isDelivery ? 'delivery' : isTakeout ? 'takeaway' : 'dine_in';

  const subtotal     = cart.reduce((sum, ci) => sum + (ci.unitPrice ?? ci.foodItem?.price ?? (ci as any).price ?? 0) * (ci.quantity || 1), 0);
  const effectivePacks = Math.max(packCount, 1);
  const packagingFee = isTakeout ? effectivePacks * packUnitPrice : 0;
  const deliveryFee  = isDelivery ? deliveryUnitPrice : 0;
  const vat          = Math.round((subtotal + packagingFee + deliveryFee) * 0.075);
  const total        = subtotal + packagingFee + deliveryFee + vat;

  const headerLabel =
    isDelivery              ? '🚴 Delivery Order'  :
    topOrderMode === 'takeaway' ? '🥡 Takeout Order'  :
                                  '🍽️ Dine-in Order';

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDelivery && !deliveryAddress.trim()) return;
    const defaultName =
      isDelivery              ? `Delivery — ${deliveryAddress}` :
      isTakeout               ? `Takeout (${currentTable || 'Walk-in'})` :
                                `Diner at ${currentTable || 'Table 1'}`;

    const newOrder = placeOrder(
      customerName || defaultName,
      paymentChoice,
      {
        customerPhone: customerPhone.trim() || undefined,
        subtotal,
        vat,
        orderType,
        deliveryAddress: isDelivery ? deliveryAddress : undefined,
        packagingFee: packagingFee > 0 ? packagingFee : undefined,
        deliveryFee: deliveryFee > 0 ? deliveryFee : undefined,
        packCount: isTakeout ? effectivePacks : undefined,
        paymentProofUrl: paymentProofUrl || undefined,
      }
    );
    if (newOrder) setOrderPlacedSuccess(newOrder.id);
  };

  const handleFinish = () => {
    setOrderPlacedSuccess(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end">
      <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl relative animate-in slide-in-from-right duration-200">

        {/* ── Header ── */}
        <div className="p-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] border-b border-neutral-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ShoppingBag className="w-5 h-5 text-amber-600 shrink-0" />
            <h2 className="text-base font-bold text-neutral-900 truncate">{headerLabel}</h2>
            {currentTable && (
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-100 text-amber-900 shrink-0">
                {currentTable}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-900 rounded-lg shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {orderPlacedSuccess ? (
          /* ── SUCCESS SCREEN ── */
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900">Order Placed! 🎉</h3>
            <p className="text-xs text-neutral-500 mt-1 mb-4">
              Ticket <span className="font-mono font-bold text-neutral-800">#{orderPlacedSuccess}</span> sent to {activeRestaurant?.name || 'the'}'s kitchen instantly.
            </p>
            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 w-full text-xs text-neutral-600 mb-6 font-mono space-y-1 text-left">
              {currentTable && <div>Table: {currentTable}</div>}
              <div>Type: {headerLabel}</div>
              {isDelivery && deliveryAddress && <div>To: {deliveryAddress}</div>}
              <div>Source: {isNfcSource ? 'NFC Card Tap' : 'QR Scan'}</div>
              <div>
                Payment:{' '}
                {paymentChoice === 'pos'      ? 'Card / POS (waiter brings machine)' :
                 paymentChoice === 'cash'     ? 'Cash to Waitstaff'                  :
                                               'Direct Bank Transfer'}
              </div>
            </div>
            <button
              onClick={handleFinish}
              className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-xl text-sm transition-colors"
            >
              Back to Menu
            </button>
          </div>
        ) : (
          <>
            {/* ── BIG ORDER TYPE BANNER (the most obvious choice) ── */}
            {!isCounterMode && (
              <div className="px-4 pt-3 pb-2 border-b border-neutral-100 shrink-0">
                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">How would you like your order?</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {/* Dine-in */}
                  <button
                    type="button"
                    onClick={() => setTopOrderMode('dine_in')}
                    className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 font-bold text-xs transition-all ${
                      topOrderMode === 'dine_in'
                        ? 'border-neutral-900 bg-neutral-900 text-white shadow-md scale-[1.03]'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-400'
                    }`}
                  >
                    <UtensilsCrossed className="w-5 h-5" />
                    <span>Eat Here</span>
                    {currentTable && (
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${topOrderMode === 'dine_in' ? 'bg-white/20' : 'bg-neutral-200'}`}>
                        {currentTable}
                      </span>
                    )}
                  </button>

                  {/* Takeout */}
                  <button
                    type="button"
                    onClick={() => setTopOrderMode('takeaway')}
                    className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 font-bold text-xs transition-all ${
                      topOrderMode === 'takeaway'
                        ? 'border-amber-500 bg-amber-500 text-white shadow-md scale-[1.03]'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-amber-300'
                    }`}
                  >
                    <Package className="w-5 h-5" />
                    <span>Pack to Go</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${topOrderMode === 'takeaway' ? 'bg-white/20' : 'bg-neutral-200'}`}>Takeout</span>
                  </button>

                  {/* Delivery */}
                  <button
                    type="button"
                    onClick={() => setTopOrderMode('delivery')}
                    className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 font-bold text-xs transition-all ${
                      topOrderMode === 'delivery'
                        ? 'border-blue-500 bg-blue-500 text-white shadow-md scale-[1.03]'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-blue-300'
                    }`}
                  >
                    <Bike className="w-5 h-5" />
                    <span>Delivery</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${topOrderMode === 'delivery' ? 'bg-white/20' : 'bg-neutral-200'}`}>To you</span>
                  </button>
                </div>

                {/* Counter mode — single fast label */}
              </div>
            )}

            {isCounterMode && (
              <div className="mx-4 mt-3 mb-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl shrink-0">
                <Zap className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-xs font-bold text-amber-900">Counter Takeaway — your order will be ready at the counter</span>
              </div>
            )}

            {/* ── Cart Items ── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">

              {cart.length === 0 ? (
                <div className="text-center py-16 text-neutral-400">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-neutral-300" />
                  <p className="text-sm font-semibold text-neutral-600">Your cart is empty</p>
                  <p className="text-xs text-neutral-400 mt-1">Go back to the menu and tap <strong>+</strong> on any dish.</p>
                </div>
              ) : (
                cart.map((ci, index) => {
                  const itemPrice = (ci.unitPrice ?? ci.foodItem?.price ?? (ci as any).price ?? 0);
                  return (
                    <div
                      key={index}
                      className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 text-xs space-y-2"
                    >
                      {/* Item name + remove */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-neutral-900 block leading-tight">
                            {ci.foodItem?.name || (ci as any).name || (ci as any).title || 'Item'}
                          </span>
                          {ci.selectedModifiers && ci.selectedModifiers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {ci.selectedModifiers.map((m, mi) => (
                                <span key={mi} className="px-1.5 py-0.5 rounded bg-amber-100/80 text-amber-900 text-[10px] font-medium">
                                  + {m.name}{m.price > 0 ? ` (${design.currencySymbol}${m.price.toLocaleString()})` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          {ci.notes && (
                            <div className="text-[11px] text-neutral-500 mt-0.5 italic">Note: {ci.notes}</div>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromCart(index)}
                          className="text-neutral-300 hover:text-red-500 transition-colors p-1 shrink-0"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Qty + price row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-lg px-2 py-0.5 shadow-xs">
                          <button
                            onClick={() => updateCartItemQuantity(index, ci.quantity - 1)}
                            className="text-neutral-500 hover:text-neutral-900 w-5 h-5 flex items-center justify-center font-bold"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-bold text-neutral-900 w-5 text-center">{ci.quantity}</span>
                          <button
                            onClick={() => updateCartItemQuantity(index, ci.quantity + 1)}
                            className="text-neutral-500 hover:text-neutral-900 w-5 h-5 flex items-center justify-center font-bold"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-mono font-bold text-neutral-800 text-xs ml-auto">
                          {design.currencySymbol}{(itemPrice * (ci.quantity || 1)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* ── Checkout Form ── */}
            {cart.length > 0 && (
              <form onSubmit={handleCheckout} className="p-4 border-t border-neutral-200 bg-neutral-50/50 space-y-3 text-xs shrink-0 max-h-[55vh] overflow-y-auto">

                {/* Delivery address field */}
                {isDelivery && (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl space-y-1.5 animate-in fade-in">
                    <label className="font-bold text-blue-900 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Delivery Address *
                    </label>
                    <textarea
                      required
                      value={deliveryAddress}
                      onChange={e => setDeliveryAddress(e.target.value)}
                      rows={2}
                      placeholder="Enter full delivery address..."
                      className="w-full px-2 py-1.5 bg-white border border-blue-200 rounded-lg focus:outline-none focus:border-blue-400 text-neutral-900 resize-none"
                    />
                  </div>
                )}

                {/* Takeaway packs control */}
                {isTakeout && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-amber-950 block">Foil Pack + Cutlery</span>
                        <span className="text-[10px] text-amber-700">Sealed pack + carrier bag per unit</span>
                      </div>
                      <span className="font-mono font-bold text-amber-900">
                        {design.currencySymbol}{packUnitPrice.toLocaleString()} / pack
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-amber-200/60">
                      <span className="text-[11px] text-amber-900 font-medium">
                        Packs needed ({cart.reduce((s,ci)=>s+ci.quantity,0)} items):
                      </span>
                      <div className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg px-2 py-0.5">
                        <button type="button" onClick={() => setPackCount(c => Math.max(1, c - 1))} className="text-amber-800 hover:text-amber-950 font-bold px-1">-</button>
                        <span className="font-mono font-bold text-amber-950 text-xs w-5 text-center">{effectivePacks}</span>
                        <button type="button" onClick={() => setPackCount(c => c + 1)} className="text-amber-800 hover:text-amber-950 font-bold px-1">+</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cost Breakdown */}
                <div className="space-y-1 border-b border-neutral-200 pb-3">
                  <div className="flex justify-between text-neutral-600">
                    <span>Subtotal</span>
                    <span className="font-mono">{design.currencySymbol}{subtotal.toLocaleString()}</span>
                  </div>
                                    {isTakeout && packagingFee > 0 && (
                    <div className="flex justify-between text-amber-800 font-medium">
                      <span>Packaging ({effectivePacks}x {design.currencySymbol}{packUnitPrice.toLocaleString()})</span>
                      <span className="font-mono">+{design.currencySymbol}{packagingFee.toLocaleString()}</span>
                    </div>
                  )}
                  {isDelivery && deliveryFee > 0 && (
                    <div className="flex justify-between text-blue-700 font-medium">
                      <span>Delivery Fee</span>
                      <span className="font-mono">+{design.currencySymbol}{deliveryFee.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-neutral-600">
                    <span>VAT (7.5%)</span>
                    <span className="font-mono">{design.currencySymbol}{vat.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold text-neutral-900 text-sm pt-1">
                    <span>Total Due</span>
                    <span className="font-mono text-amber-800">{design.currencySymbol}{total.toLocaleString()}</span>
                  </div>
                </div>

                {/* Customer Details */}
                <div className="space-y-2">
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Your Name (e.g. David Adebayo)"
                    className="w-full px-3 py-2.5 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900"
                  />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="Phone Number (for order updates & VIP rewards)"
                    className="w-full px-3 py-2.5 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900"
                  />
                </div>

                {/* Payment Method */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider">Payment Method</label>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold">100% Direct to Restaurant</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['pos','cash','transfer'] as const).map(method => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentChoice(method)}
                        className={`p-2.5 rounded-xl border text-center transition-all ${
                          paymentChoice === method
                            ? 'border-neutral-900 bg-neutral-900 text-white font-bold shadow-xs'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                        }`}
                      >
                        {method === 'pos'      && <><CreditCard className="w-4 h-4 mx-auto mb-1 text-amber-400" /><div className="text-[11px]">Card / POS</div><div className="text-[9px] opacity-70">At Counter</div></>}
                        {method === 'cash'     && <><Coins      className="w-4 h-4 mx-auto mb-1 text-amber-400" /><div className="text-[11px]">Cash</div><div className="text-[9px] opacity-70">To Waiter</div></>}
                        {method === 'transfer' && <><Building2  className="w-4 h-4 mx-auto mb-1 text-amber-400" /><div className="text-[11px]">Transfer</div><div className="text-[9px] opacity-70">Bank</div></>}
                      </button>
                    ))}
                  </div>
                  {/* Direct Bank Transfer Details & Receipt Upload */}
                  {paymentChoice === 'transfer' && (
                    <div className="p-3 bg-neutral-100/90 border border-neutral-300 rounded-2xl space-y-2.5 animate-in fade-in">
                      <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2">
                        <span className="font-bold text-neutral-800 text-[11px] flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-amber-600" /> Restaurant Bank Account
                        </span>
                        <span className="text-[10px] text-emerald-800 bg-emerald-100 font-mono font-bold px-2 py-0.5 rounded">
                          Direct Transfer
                        </span>
                      </div>

                      {activeRestaurant?.accountNumber ? (
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Bank:</span>
                            <span className="font-bold text-neutral-900">{activeRestaurant.bankName || 'Bank'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-neutral-500">Account No:</span>
                            <div className="flex items-center gap-1.5 font-mono font-bold text-neutral-950 bg-white px-2 py-0.5 rounded border border-neutral-200 shadow-xs">
                              <span>{activeRestaurant.accountNumber}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                                    navigator.clipboard.writeText(activeRestaurant.accountNumber || '');
                                    showNotification('Account number copied to clipboard!');
                                  }
                                }}
                                className="text-[10px] text-amber-700 hover:text-amber-900 font-sans underline cursor-pointer"
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                          {activeRestaurant.accountName && (
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Account Name:</span>
                              <span className="font-bold text-neutral-900 truncate max-w-[180px]">{activeRestaurant.accountName}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-neutral-500 italic">
                          Staff will confirm bank transfer details with you directly upon order placement.
                        </p>
                      )}

                      {/* I Have Paid & Proof Upload */}
                      <div className="pt-2 border-t border-neutral-200">
                        {!hasPaidClicked ? (
                          <button
                            type="button"
                            onClick={() => setHasPaidClicked(true)}
                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>I Have Paid (Attach Transfer Screenshot)</span>
                          </button>
                        ) : (
                          <div className="space-y-2 animate-in fade-in">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-neutral-800">Payment Screenshot:</span>
                              <button
                                type="button"
                                onClick={() => { setHasPaidClicked(false); setPaymentProofUrl(''); }}
                                className="text-neutral-400 hover:text-neutral-600 text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>

                            <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-neutral-300 hover:border-amber-500 rounded-xl cursor-pointer bg-white transition-colors">
                              {paymentProofUrl ? (
                                <div className="flex items-center gap-2.5">
                                  <img src={paymentProofUrl} alt="Receipt" className="w-12 h-12 object-cover rounded-lg border border-neutral-200" />
                                  <div className="text-left">
                                    <span className="text-xs font-bold text-emerald-700 block">✓ Screenshot Attached</span>
                                    <span className="text-[10px] text-neutral-400">Tap to replace</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center space-y-1">
                                  <Upload className="w-5 h-5 text-neutral-400 mx-auto" />
                                  <span className="text-xs font-bold text-neutral-700 block">Tap to upload transfer receipt</span>
                                  <span className="text-[10px] text-neutral-400 block">Compressed client-side</span>
                                </div>
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    try {
                                      const compressed = await compressImageToDataUrl(file, 900);
                                      setPaymentProofUrl(compressed);
                                      showNotification('Payment screenshot attached!');
                                    } catch {}
                                  }
                                }}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-neutral-400 text-center">
                    💚 TapMenu never holds your money. Payments go directly to {activeRestaurant?.name || 'the restaurant'}.
                  </p>
                </div>

                <div className="pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
                  <button
                    type="submit"
                    className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold rounded-xl text-sm transition-colors shadow-md flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                  >
                    <span>Send Order · {design.currencySymbol}{total.toLocaleString()}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};

