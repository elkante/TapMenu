import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { TopNav } from './components/TopNav';
import { FlipbookViewer } from './components/Flipbook/FlipbookViewer';
import { QuickMenuView } from './components/QuickMenu/QuickMenuView';
import { CustomerCartDrawer } from './components/CustomerCartDrawer';
import { WaiterCallModal } from './components/WaiterCallModal';
import { RestaurantDashboard } from './components/Dashboard/RestaurantDashboard';
import { LandingPage } from './components/Landing/LandingPage';
import { AuthPortal } from './components/Auth/AuthPortal';
import { PricingPage } from './components/Pricing/PricingPage';
import { SuperAdminView } from './components/SuperAdmin/SuperAdminView';
import { SplashScreen } from './components/SplashScreen';
import { DishModifierModal } from './components/DishModifierModal';
import { FoodItem, SelectedModifier } from './types';
import { Sparkles, Store, ArrowRight } from 'lucide-react';

const MainContent: React.FC = () => {
  const { 
    currentView, 
    notificationMsg, 
    activeRestaurant, 
    addToCart,
    isCustomerRoute,
    restaurantNotFound,
    requestedSlug,
    ownerSession 
  } = useApp();

  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [waiterModalOpen, setWaiterModalOpen] = useState(false);
  const [modalItem, setModalItem] = useState<FoodItem | null>(null);

  // Standalone page routing (?page=pricing, secret /sys-hq)
  const [showPricing, setShowPricing] = useState(() => {
    return new URLSearchParams(window.location.search).get('page') === 'pricing';
  });
  const [showAdmin, setShowAdmin] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return window.location.pathname === '/sys-hq' || params.get('page') === 'sys-hq';
  });

  // Master Super Admin view route
  if (showAdmin) {
    return <SuperAdminView />;
  }

  // Dedicated Pricing Page route
  if (showPricing) {
    return (
      <PricingPage
        onBackToHome={() => {
          setShowPricing(false);
          if (window.location.search.includes('page=pricing')) {
            window.history.pushState({}, '', window.location.pathname);
          }
        }}
        onOpenSignup={() => {
          setShowPricing(false);
          window.history.pushState({}, '', window.location.pathname);
        }}
        onOpenLogin={() => {
          setShowPricing(false);
          window.history.pushState({}, '', window.location.pathname);
        }}
      />
    );
  }

  const handleOpenItem = (item: FoodItem) => {
    setModalItem(item);
  };

  const handleConfirmAddToCart = (item: FoodItem, notes: string, qty: number, selectedModifiers: SelectedModifier[]) => {
    if (!item || item.isSoldOut) return;
    addToCart(item, notes, qty, selectedModifiers);
    setModalItem(null);
  };

  // =========================================================================
  // ROUTE 1: Customer visits an invalid / unknown slug
  // =========================================================================
  if (isCustomerRoute && restaurantNotFound) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
          <Store className="w-8 h-8" />
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Restaurant Not Found</h1>
        <p className="text-xs sm:text-sm text-neutral-400 mt-2 max-w-sm">
          No restaurant is registered with slug <span className="font-mono text-amber-400">"{requestedSlug}"</span>.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <a
            href="/"
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <span>Create Your Restaurant Menu</span>
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="/"
            className="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold rounded-xl text-xs border border-neutral-800 transition-colors"
          >
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ROUTE 2: Restaurant Owner (No ?r= slug in URL)
  // =========================================================================
  if (!isCustomerRoute) {
    if (ownerSession) {
      return (
        <>
          {notificationMsg && (
            <div className="fixed bottom-6 right-6 z-50 bg-neutral-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-neutral-700 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom duration-200">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{notificationMsg}</span>
            </div>
          )}
          <RestaurantDashboard />
        </>
      );
    }
    // Owner is not logged in: show the high-converting SaaS Landing Page
    return <LandingPage onOpenPricing={() => setShowPricing(true)} />;
  }

  // =========================================================================
  // ROUTE 3: Customer Menu (e.g. ?r=lagos-bites&table=Table+5)
  // =========================================================================
  if (activeRestaurant.status === 'suspended') {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-neutral-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="max-w-sm w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center mx-auto text-2xl font-bold">
            ⏸️
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">{activeRestaurant.name}</h2>
          <div className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
            Services Temporarily Paused
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Online ordering and digital menu services for this venue are currently paused by administration or awaiting subscription renewal.
          </p>
          <div className="pt-2 text-[11px] text-neutral-500 border-t border-neutral-800/80">
            Please ask staff at the counter for assistance.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-neutral-100 flex flex-col font-sans">
      {/* Toast Notification */}
      {notificationMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-neutral-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-neutral-700 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom duration-200">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Customer Header */}
      <TopNav
        onOpenCart={() => setCartDrawerOpen(true)}
        onOpenWaiterModal={() => setWaiterModalOpen(true)}
      />

      {/* Customer View: Flipbook or Fast Scroll Quick Menu */}
      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        {currentView === 'quick_menu' ? (
          <QuickMenuView onSelectItem={handleOpenItem} />
        ) : (
          <FlipbookViewer />
        )}
      </main>

      {/* Customer Slide-Over Cart Drawer */}
      <CustomerCartDrawer
        isOpen={cartDrawerOpen}
        onClose={() => setCartDrawerOpen(false)}
      />

      {/* Customer Waiter Assistance Buzzer Modal */}
      <WaiterCallModal
        isOpen={waiterModalOpen}
        onClose={() => setWaiterModalOpen(false)}
      />

      {/* Dish Customization & Modifiers Modal */}
      <DishModifierModal
        item={modalItem}
        currencySymbol={activeRestaurant.design.currencySymbol}
        onClose={() => setModalItem(null)}
        onConfirm={handleConfirmAddToCart}
      />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <SplashScreen />
      <MainContent />
    </AppProvider>
  );
}
