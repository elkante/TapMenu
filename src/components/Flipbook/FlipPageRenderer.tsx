import React from 'react';
import { MenuBookPage, MenuBookDesign, FoodItem } from '../../types';
import { Plus, Clock, AlertCircle } from 'lucide-react';

export const getDishFallbackImage = (itemName: string, pageTitle?: string): string => {
  const combined = `${itemName} ${pageTitle || ''}`.toLowerCase();
  if (combined.includes('drink') || combined.includes('beverage') || combined.includes('cocktail') || combined.includes('wine') || combined.includes('juice') || combined.includes('beer') || combined.includes('tea') || combined.includes('coffee') || combined.includes('water')) {
    return 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80';
  }
  if (combined.includes('suya') || combined.includes('grill') || combined.includes('steak') || combined.includes('bbq') || combined.includes('barbecue') || combined.includes('meat') || combined.includes('ribs') || combined.includes('kebab') || combined.includes('chicken') || combined.includes('beef') || combined.includes('lamb')) {
    return 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80';
  }
  if (combined.includes('rice') || combined.includes('jollof') || combined.includes('fried rice') || combined.includes('biryani') || combined.includes('platter')) {
    return 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=400&q=80';
  }
  if (combined.includes('soup') || combined.includes('swallow') || combined.includes('egusi') || combined.includes('yam') || combined.includes('stew') || combined.includes('curry') || combined.includes('pepper soup')) {
    return 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=400&q=80';
  }
  if (combined.includes('salad') || combined.includes('starter') || combined.includes('appetizer') || combined.includes('spring roll') || combined.includes('wing') || combined.includes('snack')) {
    return 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400&q=80';
  }
  if (combined.includes('dessert') || combined.includes('cake') || combined.includes('sweet') || combined.includes('ice cream') || combined.includes('waffle') || combined.includes('pastry')) {
    return 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=400&q=80';
  }
  if (combined.includes('burger') || combined.includes('sandwich') || combined.includes('shawarma') || combined.includes('wrap') || combined.includes('fries')) {
    return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80';
  }
  if (combined.includes('fish') || combined.includes('seafood') || combined.includes('prawn') || combined.includes('shrimp') || combined.includes('salmon')) {
    return 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=400&q=80';
  }
  if (combined.includes('pasta') || combined.includes('spaghetti') || combined.includes('noodle')) {
    return 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=400&q=80';
  }
  return 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80';
};

interface FlipPageRendererProps {
  page: MenuBookPage;
  design: MenuBookDesign;
  restaurantName: string;
  restaurantLogo: string;
  restaurantTagline: string;
  restaurantHours?: string;
  restaurantAddress?: string;
  isCover?: boolean;
  coverImage?: string;
  onSelectItem?: (item: FoodItem) => void;
  onAddToCart?: (item: FoodItem, e: React.MouseEvent) => void;
  onOpenReviews?: () => void;
  pageNumberDisplay?: string | number;
}

export const FlipPageRenderer: React.FC<FlipPageRendererProps> = ({
  page,
  design,
  restaurantName,
  restaurantLogo,
  restaurantTagline,
  restaurantHours,
  restaurantAddress,
  isCover = false,
  coverImage,
  onSelectItem,
  onAddToCart,
  onOpenReviews,
  pageNumberDisplay,
}) => {
  const coverThemeColor = design.coverColor || design.primaryColor || '#0c2e22';
  const isDark = design.paperTexture === 'dark_slate';

  const getTextureBg = () => {
    switch (design.paperTexture) {
      case 'dark_slate':
        return 'bg-[#18181b] text-neutral-100';
      case 'warm_kraft':
        return 'bg-[#F5EFE6] text-stone-900';
      case 'classic_linen':
      case 'parchment':
      case 'clean_cardstock':
      default:
        return 'bg-[#FAF7F2] text-stone-900';
    }
  };

  const getFontFamily = () => {
    switch (design.fontStyle) {
      case 'serif_luxury':
        return 'font-serif';
      case 'bold_punchy':
        return 'font-sans font-black tracking-tight';
      case 'retro_bistro':
      case 'modern_sans':
      default:
        return 'font-serif';
    }
  };

  // =========================================================================
  // COVER PAGE: Luxury Leather Bound Menu Book (Inspired by "The Corner Table")
  // =========================================================================
  if (page.layout === 'cover' || isCover) {
    const hasImageLogo = restaurantLogo && (
      restaurantLogo.startsWith('data:') || 
      restaurantLogo.startsWith('http') || 
      restaurantLogo.startsWith('/')
    );

    const effectiveCover = coverImage || page.backgroundImage;

    return (
      <div 
        className="w-full h-full relative flex flex-col justify-between overflow-hidden select-none"
        style={{
          backgroundColor: coverThemeColor,
          boxShadow: 'inset 0 0 50px rgba(0,0,0,0.6)'
        }}
      >
        {/* Cover Photo / Background Image if uploaded */}
        {effectiveCover ? (
          <div 
            className="absolute inset-0 bg-cover bg-center pointer-events-none transition-all duration-300"
            style={{ 
              backgroundImage: `url(${effectiveCover})`,
              filter: 'brightness(0.45) contrast(1.15) saturate(1.1)'
            }}
          />
        ) : (
          /* Subtle leather texture overlay */
          <div 
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0.4) 100%)'
            }}
          />
        )}

        {/* Book Spine Crease & 3D Shadow on Left */}
        <div 
          className="absolute top-0 bottom-0 left-0 w-8 z-20 pointer-events-none"
          style={{
            background: 'linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)'
          }}
        />
        {/* Spine vertical stitch highlight */}
        <div className="absolute top-4 bottom-4 left-3 w-[1px] bg-amber-400/25 z-20 pointer-events-none" />

        {/* Debossed Gold Stitched Perimeter (Just like The Corner Table!) */}
        <div className="absolute inset-3 sm:inset-5 border-2 border-dashed border-[#D4AF37]/55 rounded-2xl sm:rounded-3xl pointer-events-none z-10" />

        {/* Brass Corner Braces in 4 corners */}
        <div className="absolute top-4 left-4 w-7 h-7 border-t-2 border-l-2 border-[#D4AF37]/90 rounded-tl-lg pointer-events-none z-15">
          <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] absolute top-1 left-1 shadow-sm" />
        </div>
        <div className="absolute top-4 right-4 w-7 h-7 border-t-2 border-r-2 border-[#D4AF37]/90 rounded-tr-lg pointer-events-none z-15">
          <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] absolute top-1 right-1 shadow-sm" />
        </div>
        <div className="absolute bottom-4 left-4 w-7 h-7 border-b-2 border-l-2 border-[#D4AF37]/90 rounded-bl-lg pointer-events-none z-15">
          <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] absolute bottom-1 left-1 shadow-sm" />
        </div>
        <div className="absolute bottom-4 right-4 w-7 h-7 border-b-2 border-r-2 border-[#D4AF37]/90 rounded-br-lg pointer-events-none z-15">
          <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] absolute bottom-1 right-1 shadow-sm" />
        </div>

        {/* Top Spacer / Tagline */}
        <div className="relative z-10 pt-10 px-8 text-center" />

        {/* Centerpiece: Emblem + Luxury Gold Foil Title + Subtitle */}
        <div className="relative z-10 text-center px-6 sm:px-10 my-auto">
          {/* Heraldic Shield Crest Emblem */}
          {hasImageLogo ? (
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-2xl overflow-hidden border-2 border-[#D4AF37] shadow-xl p-1 bg-black/40">
              <img src={restaurantLogo} alt={restaurantName} className="w-full h-full object-cover rounded-xl" />
            </div>
          ) : (
            <div className="w-12 h-14 sm:w-14 sm:h-16 mx-auto mb-4 flex items-center justify-center">
              <svg viewBox="0 0 100 120" className="w-full h-full drop-shadow-[0_2px_8px_rgba(212,175,55,0.4)]" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M50 5 L90 25 L90 70 C90 95 50 115 50 115 C50 115 10 95 10 70 L10 25 Z" stroke="#D4AF37" strokeWidth="3" fill="rgba(212,175,55,0.1)"/>
                <path d="M50 20 L50 90 M25 55 L75 55" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="50" cy="55" r="4.5" fill="#D4AF37"/>
              </svg>
            </div>
          )}

          {/* Large Embossed Metallic Gold Title (or Custom Cover Text Color) */}
          <h1 
            className={`font-serif text-3xl xs:text-4xl sm:text-5xl font-bold tracking-tight leading-tight ${
              design.coverTextColor 
                ? '' 
                : 'text-transparent bg-clip-text bg-gradient-to-b from-[#FFF5C0] via-[#D4AF37] to-[#A07818]'
            }`}
            style={{
              color: design.coverTextColor || undefined,
              textShadow: design.coverTextColor 
                ? '0 2px 8px rgba(0,0,0,0.85)' 
                : '0 2px 6px rgba(0,0,0,0.7)',
              letterSpacing: '-0.01em'
            }}
          >
            {restaurantName}
          </h1>

          {/* Subtitle / Tagline */}
          <p 
            className="text-xs sm:text-sm font-semibold uppercase tracking-[0.28em] mt-3"
            style={{ 
              color: design.coverTextColor ? `${design.coverTextColor}dd` : '#E8C868',
              textShadow: '0 1px 3px rgba(0,0,0,0.8)' 
            }}
          >
            {restaurantTagline || 'KITCHEN & BAR'}
          </p>

          {/* Tapered Gold Divider Line */}
          <div className="flex items-center justify-center gap-2 mt-4 max-w-[160px] mx-auto opacity-75">
            <div 
              className="flex-1 h-[1px]" 
              style={{ background: `linear-gradient(to right, transparent, ${design.coverTextColor || '#D4AF37'})` }} 
            />
            <div 
              className="w-1.5 h-1.5 rotate-45" 
              style={{ backgroundColor: design.coverTextColor || '#D4AF37' }} 
            />
            <div 
              className="flex-1 h-[1px]" 
              style={{ background: `linear-gradient(to left, transparent, ${design.coverTextColor || '#D4AF37'})` }} 
            />
          </div>
        </div>

        {/* Bottom Prompts: SWIPE TO OPEN + Leave Review */}
        <div className="relative z-10 text-center pb-6 sm:pb-8 px-6 space-y-3">
          {/* Main Call To Action: SWIPE TO OPEN with animated directional arrow indicator */}
          <div className="flex flex-col items-center justify-center gap-1.5">
            <div 
              className="text-sm xs:text-base sm:text-lg font-black tracking-[0.22em] uppercase flex items-center justify-center gap-2 drop-shadow-md select-none"
              style={{ color: design.coverTextColor || '#D4AF37' }}
            >
              <span>SWIPE TO OPEN</span>
              <span className="inline-block animate-pulse text-lg xs:text-xl font-bold">➔</span>
            </div>

            {/* Visual Directional Indicator Slide Pill */}
            <div 
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-current/30 text-[10px] font-bold tracking-wider uppercase opacity-85 shadow-xs"
              style={{ color: design.coverTextColor || '#D4AF37' }}
            >
              <span>Slide Left</span>
              <span className="animate-bounce inline-block text-xs font-black">←</span>
            </div>
          </div>

          {/* Leave Us a Review Button */}
          {onOpenReviews && (
            <div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenReviews();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full backdrop-blur-md bg-black/40 hover:bg-black/60 border text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                style={{
                  borderColor: design.coverTextColor ? `${design.coverTextColor}70` : '#D4AF37',
                  color: design.coverTextColor || '#FFF5C0'
                }}
              >
                <span>⭐ Leave Us a Review</span>
                <span className="opacity-75 text-[10px] font-normal">(IG / TikTok)</span>
              </button>
            </div>
          )}

          {restaurantHours && (
            <p className="text-[10px] text-amber-200/60 font-medium truncate max-w-xs mx-auto pt-0.5">
              {restaurantHours}
            </p>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // INTERIOR MENU PAGES: Luxury Cream Parchment with Dot Leaders (Ref: Image 1)
  // =========================================================================
  return (
    <div className={`w-full h-full p-3 sm:p-5 flex flex-col justify-between relative overflow-hidden select-none ${getTextureBg()}`}>
      {/* Book Spine Shadow on left */}
      <div 
        className="absolute top-0 bottom-0 left-0 w-6 z-10 pointer-events-none"
        style={{
          background: 'linear-gradient(to right, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.05) 60%, transparent 100%)'
        }}
      />

      {/* Page Header */}
      <div className="mb-2 shrink-0 pb-2 border-b border-stone-300/80">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-amber-800 font-bold block">
              {restaurantName}
            </span>
            <h2 className={`text-lg sm:text-xl font-bold tracking-tight text-stone-900 ${getFontFamily()}`}>
              {page.title}
            </h2>
            {page.subtitle && (
              <p className="text-[11px] text-stone-500 mt-0.5 italic">{page.subtitle}</p>
            )}
          </div>
          <span className="text-xs font-mono font-bold text-stone-400">
            P. {pageNumberDisplay || page.pageNumber}
          </span>
        </div>
      </div>

      {/* Main Content Area: Dishes list with Dot Leaders & Smooth Native Touch Scroll */}
      <div 
        className="flex-1 min-h-0 overflow-y-auto space-y-2.5 px-0.5 pr-1.5 pb-12 overscroll-contain"
        style={{
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {page.items.length === 0 ? (
          <div className="py-12 text-center text-stone-400">
            <p className="text-xs italic">No dishes added to this section yet.</p>
          </div>
        ) : (
          page.items.map(item => (
            <div
              key={item.id}
              onClick={() => !item.isSoldOut && onSelectItem?.(item)}
              className={`p-2 rounded-xl transition-all flex items-center gap-2.5 group relative border ${
                item.isSoldOut 
                  ? 'opacity-55 cursor-not-allowed bg-stone-100/60 border-stone-200' 
                  : 'cursor-pointer hover:bg-stone-50/80 border-transparent hover:border-amber-200/80 active:scale-[0.995]'
              }`}
            >
              {/* Dish Photo Thumbnail (Always Present for Authentic Luxury Menu) */}
              {(() => {
                const displayImage = item.imageUrl || getDishFallbackImage(item.name, page.title);
                return (
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 bg-stone-200 relative shadow-xs border border-stone-200/80">
                    <img
                      src={displayImage}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className={`w-full h-full object-cover transition-transform duration-300 ${
                        !item.isSoldOut ? 'group-hover:scale-105' : 'grayscale'
                      }`}
                    />
                    {item.isSoldOut && (
                      <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                        <span className="bg-red-600 text-white text-[8px] font-bold px-1 py-0.5 rounded uppercase">Sold</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Dish info & Dot-Leader Price */}
              <div className="flex-1 min-w-0 pr-0.5">
                <div className="flex items-baseline justify-between gap-1">
                  <span className={`text-xs sm:text-sm font-bold text-stone-900 truncate ${
                    !item.isSoldOut ? 'group-hover:text-amber-900 transition-colors' : ''
                  }`}>
                    {item.name}
                  </span>

                  {/* Dot Leader */}
                  <span className="flex-1 border-b border-dotted border-stone-300 mx-1 hidden xs:inline-block relative -top-1" />

                  {/* Price */}
                  <span className={`font-mono text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 ${
                    item.isSoldOut ? 'line-through text-stone-400' : 'text-amber-800'
                  }`}>
                    {design.currencySymbol}{item.price.toLocaleString()}
                  </span>
                </div>

                {item.description && (
                  <p className="text-[10px] sm:text-[11px] text-stone-500 line-clamp-1 sm:line-clamp-2 mt-0.5 leading-relaxed">
                    {item.description}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-0.5 text-[9px] sm:text-[10px]">
                  {item.badge && !item.isSoldOut && (
                    <span className="font-semibold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                      {item.badge}
                    </span>
                  )}
                  {item.prepTime && !item.isSoldOut && (
                    <span className="text-stone-400 flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" /> {item.prepTime}
                    </span>
                  )}
                  {item.isSoldOut && (
                    <span className="text-red-500 font-bold uppercase tracking-wider text-[9px]">
                      Sold Out
                    </span>
                  )}
                </div>
              </div>

              {/* 1-Tap Quick Add Button - fixed dimensions, touch protected */}
              {!item.isSoldOut && (
                <button
                  type="button"
                  data-action="add-to-cart"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onAddToCart) {
                      onAddToCart(item, e);
                    } else {
                      onSelectItem?.(item);
                    }
                  }}
                  className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-90 text-neutral-950 font-black shadow-xs transition-all shrink-0 cursor-pointer flex items-center justify-center border border-amber-600/30 z-30 pointer-events-auto"
                  title="Add directly to cart"
                  aria-label={`Add ${item.name} to cart`}
                >
                  <Plus className="w-4 h-4 text-neutral-950 stroke-[3] pointer-events-none" />
                </button>
              )}
            </div>
          ))
        )}

        {page.items.length > 2 && (
          <div className="pt-2 pb-2 text-center text-[10px] text-amber-900 font-mono font-bold tracking-wide flex items-center justify-center gap-1 opacity-90 select-none">
            <span>↕ Scroll to view all {page.items.length} items</span>
          </div>
        )}
      </div>

      {/* Page Footer */}
      <div className="pt-2 shrink-0 flex items-center justify-between text-[10px] text-stone-400 border-t border-stone-200">
        <span className="truncate">{restaurantName}</span>
        <span className="font-mono">Page {pageNumberDisplay || page.pageNumber}</span>
      </div>
    </div>
  );
};
