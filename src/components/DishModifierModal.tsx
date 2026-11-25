import React, { useState, useEffect } from 'react';
import { FoodItem, SelectedModifier } from '../types';
import { X, Plus, Minus, AlertCircle, Check } from 'lucide-react';

interface DishModifierModalProps {
  item: FoodItem | null;
  currencySymbol: string;
  onClose: () => void;
  onConfirm: (item: FoodItem, notes: string, qty: number, selectedModifiers: SelectedModifier[]) => void;
}

export const DishModifierModal: React.FC<DishModifierModalProps> = ({
  item,
  currencySymbol,
  onClose,
  onConfirm,
}) => {
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [selectedMods, setSelectedMods] = useState<SelectedModifier[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setQty(1);
    setNotes('');
    setValidationError(null);
    // Pre-select default options if configured
    const defaults: SelectedModifier[] = [];
    (item.modifierGroups || []).forEach(g => {
      const defOpts = (g.options || []).filter(o => o.isDefault && !o.isSoldOut);
      if (g.selectionType === 'single' && defOpts.length > 0) {
        defaults.push({
          groupId: g.id,
          groupTitle: g.title,
          optionId: defOpts[0].id,
          name: defOpts[0].name,
          price: Number(defOpts[0].price) || 0,
        });
      } else {
        defOpts.forEach(o => {
          defaults.push({
            groupId: g.id,
            groupTitle: g.title,
            optionId: o.id,
            name: o.name,
            price: Number(o.price) || 0,
          });
        });
      }
    });
    setSelectedMods(defaults);
  }, [item?.id]);

  if (!item) return null;

  const groups = item.modifierGroups || [];
  const modExtraPrice = selectedMods.reduce((sum, m) => sum + (Number(m.price) || 0), 0);
  const unitTotal = (Number(item.price) || 0) + modExtraPrice;
  const lineTotal = unitTotal * qty;

  const toggleOption = (groupId: string, groupTitle: string, selectionType: 'single' | 'multiple', maxSelect: number | undefined, opt: { id: string; name: string; price: number; isSoldOut?: boolean }) => {
    if (opt.isSoldOut) return;
    setValidationError(null);
    setSelectedMods(prev => {
      const isSelected = prev.some(m => m.groupId === groupId && m.optionId === opt.id);
      if (selectionType === 'single') {
        const withoutGroup = prev.filter(m => m.groupId !== groupId);
        if (isSelected) return withoutGroup;
        return [
          ...withoutGroup,
          { groupId, groupTitle, optionId: opt.id, name: opt.name, price: Number(opt.price) || 0 }
        ];
      } else {
        if (isSelected) {
          return prev.filter(m => !(m.groupId === groupId && m.optionId === opt.id));
        }
        const currentGroupCount = prev.filter(m => m.groupId === groupId).length;
        if (maxSelect && currentGroupCount >= maxSelect) {
          return prev;
        }
        return [
          ...prev,
          { groupId, groupTitle, optionId: opt.id, name: opt.name, price: Number(opt.price) || 0 }
        ];
      }
    });
  };

  const handleConfirm = () => {
    if (item.isSoldOut) return;
    for (const g of groups) {
      if (g.required) {
        const count = selectedMods.filter(m => m.groupId === g.id).length;
        if (count === 0) {
          setValidationError(`Please select an option for "${g.title}"`);
          return;
        }
      }
    }
    onConfirm(item, notes, qty, selectedMods);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
        {item.imageUrl && (
          <div className="w-full h-44 sm:h-48 relative overflow-hidden bg-neutral-100 shrink-0">
            <img
              src={item.imageUrl}
              alt={item.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/90"
            >
              <X className="w-4 h-4" />
            </button>
            {item.badge && (
              <span className="absolute bottom-3 left-3 px-2.5 py-1 bg-amber-500 text-neutral-950 font-bold text-xs rounded-lg shadow-sm">
                {item.badge}
              </span>
            )}
          </div>
        )}

        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {!item.imageUrl && (
            <div className="flex justify-end -mb-2">
              <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900">
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          <div>
            <div className="flex items-baseline justify-between gap-4 mb-1.5">
              <h3 className="text-lg font-bold text-neutral-900">{item.name}</h3>
              <span className="font-mono text-lg font-bold text-amber-800 shrink-0">
                {currencySymbol}{item.price.toLocaleString()}
              </span>
            </div>
            {item.description && (
              <p className="text-xs text-neutral-500 leading-relaxed">{item.description}</p>
            )}
            {(item.prepTime || (item.allergens && item.allergens.length > 0)) && (
              <div className="flex flex-wrap items-center gap-2 mt-2.5 text-[11px]">
                {item.prepTime && (
                  <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-md font-medium">
                    ⏱ {item.prepTime}
                  </span>
                )}
                {item.allergens && item.allergens.length > 0 && (
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md font-medium">
                    ⚠️ Allergens: {item.allergens.join(', ')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Nigerian Dish Modifier Groups (Swallow, Protein, Extras, Spice) */}
          {groups.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-neutral-100">
              {groups.map(group => {
                const groupSelectedCount = selectedMods.filter(m => m.groupId === group.id).length;
                return (
                  <div key={group.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-extrabold text-neutral-900 uppercase tracking-wider">
                          {group.title}
                        </h4>
                        <span className="text-[10px] text-neutral-400">
                          {group.selectionType === 'single' ? 'Choose 1' : group.maxSelect ? `Choose up to ${group.maxSelect}` : 'Select any'}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          group.required
                            ? groupSelectedCount > 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-700'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {group.required ? (groupSelectedCount > 0 ? 'Selected' : 'Required') : 'Optional'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-1.5">
                      {(group.options || []).map(opt => {
                        const isChecked = selectedMods.some(m => m.groupId === group.id && m.optionId === opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={opt.isSoldOut}
                            onClick={() => toggleOption(group.id, group.title, group.selectionType, group.maxSelect, opt)}
                            className={`w-full px-3 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all text-xs ${
                              opt.isSoldOut
                                ? 'bg-neutral-100 border-neutral-200 text-neutral-400 opacity-60 cursor-not-allowed'
                                : isChecked
                                  ? 'bg-amber-50 border-amber-500 text-neutral-950 font-bold shadow-xs'
                                  : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-4 h-4 flex items-center justify-center border shrink-0 ${
                                  group.selectionType === 'single' ? 'rounded-full' : 'rounded-md'
                                } ${
                                  isChecked
                                    ? 'bg-amber-500 border-amber-500 text-neutral-950'
                                    : 'border-neutral-300 bg-white'
                                }`}
                              >
                                {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                              </span>
                              <span className={opt.isSoldOut ? 'line-through' : ''}>{opt.name}</span>
                              {opt.isSoldOut && (
                                <span className="text-[9px] uppercase font-bold text-red-500">Sold out</span>
                              )}
                            </div>

                            <span className="font-mono text-xs font-semibold text-neutral-600 shrink-0">
                              {opt.price > 0 ? `+${currencySymbol}${opt.price.toLocaleString()}` : 'Free'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
              Kitchen Notes / Special Requests
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Extra hot yaji, sauce on side, no onions..."
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
            />
          </div>

          {validationError && (
            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="p-4 sm:p-5 border-t border-neutral-100 bg-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 bg-neutral-100 px-3 py-1.5 rounded-xl border border-neutral-200">
            <button
              type="button"
              onClick={() => setQty(Math.max(1, qty - 1))}
              className="text-neutral-600 hover:text-neutral-900"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="font-mono text-sm font-bold text-neutral-900 w-6 text-center">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty(qty + 1)}
              className="text-neutral-600 hover:text-neutral-900"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {item.isSoldOut ? (
            <div className="flex-1 py-3 px-4 bg-neutral-200 text-neutral-500 font-bold rounded-xl text-xs text-center">
              Currently Sold Out
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 py-3 px-4 bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95"
            >
              <span>Add to Order</span>
              <span>•</span>
              <span className="font-mono">{currencySymbol}{lineTotal.toLocaleString()}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
