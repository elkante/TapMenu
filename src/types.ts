export type MenuTemplateId = 
  | 'emerald_gold'
  | 'burgundy_gold'
  | 'navy_gold'
  | 'espresso_amber'
  | 'charcoal_brass'
  | 'warm_terracotta'
  | 'nigerian'
  | 'luxury'
  | 'fast_food'
  | 'cafe'
  | 'grill_bbq'
  | 'modern_minimal';

export type PageLayoutType = 
  | 'cover'
  | 'hero_three_items'
  | 'two_column_grid'
  | 'editorial_list'
  | 'drinks_beverage'
  | 'chef_specials';

export type PaperTexture = 
  | 'emerald_leather'
  | 'leather_burgundy'
  | 'leather_navy'
  | 'leather_espresso'
  | 'leather_charcoal'
  | 'parchment' 
  | 'dark_slate' 
  | 'clean_cardstock' 
  | 'warm_kraft' 
  | 'classic_linen';

export type FontStyle = 'serif_luxury' | 'modern_sans' | 'bold_punchy' | 'retro_bistro';

export interface MenuBookDesign {
  templateId: MenuTemplateId;
  paperTexture: PaperTexture;
  fontStyle: FontStyle;
  primaryColor: string;
  accentColor: string;
  coverColor?: string;
  coverTextColor?: string;
  textColor: string;
  secondaryTextColor: string;
  borderColor: string;
  showPageNumbers: boolean;
  enableAudioEffect: boolean;
  showPriceSymbols: boolean;
  currencySymbol: string;
}

export interface ModifierOption {
  id: string;
  name: string;
  price: number;
  isDefault?: boolean;
  isSoldOut?: boolean;
}

export interface ModifierGroup {
  id: string;
  title: string;
  selectionType: 'single' | 'multiple';
  required: boolean;
  maxSelect?: number;
  options: ModifierOption[];
}

export interface SelectedModifier {
  groupId: string;
  groupTitle: string;
  optionId: string;
  name: string;
  price: number;
}

export interface FoodItem {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  badge?: 'Chef Special' | 'Spicy' | 'Bestseller' | 'Vegetarian' | 'Halal' | 'Popular' | '';
  isSoldOut?: boolean;
  prepTime?: string;
  calories?: string;
  allergens?: string[];
  modifierGroups?: ModifierGroup[];
}

export interface MenuBookPage {
  id: string;
  pageNumber: number;
  title: string;
  subtitle?: string;
  layout: PageLayoutType;
  items: FoodItem[];
  customNote?: string;
  backgroundImage?: string;
  headerImage?: string;
}

export type NfcStatus = 'active' | 'unassigned' | 'damaged' | 'replaced';

export interface TableNfcTag {
  id: string;
  tableNumber: string;
  label: string;
  section: string;
  ntagSerial: string;
  nfcStatus: NfcStatus;
  totalTaps: number;
  totalScans: number;
  lastTappedAt?: string;
  urlPayload: string;
}

export interface RestaurantTenant {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo: string;
  coverImage: string;
  address: string;
  phone: string;
  openingHours: string;
  design: MenuBookDesign;
  pages: MenuBookPage[];
  tables: TableNfcTag[];
  /** Plan ID: 'basic' | 'standard' | 'premium' | 'enterprise' (or legacy string) */
  plan: string;
  /** Optional per-restaurant table limit override set by super admin (overrides plan maxTables) */
  tableLimit?: number | null;
  status: 'active' | 'pending' | 'suspended';
  quickMenuEnabled: boolean;
  allowOrdering: boolean;
  tableOrderingEnabled: boolean;
  /** Service Mode: Full table service or single counter/street vendor kiosk */
  serviceMode?: 'table_service' | 'counter_only';
  /** Takeout pack charge per item or per order (default ₦500) */
  packagingFeePerPack?: number;
  /** Delivery charge fee (default ₦1000) */
  deliveryFee?: number;
  /** Subscription & Billing Tracking */
  subscriptionExpiresAt?: string;
  subscriptionStatus?: 'active' | 'grace_period' | 'past_due' | 'suspended';
  /** Multi-store chain / branch hierarchy */
  ownerId?: string;
  parentRestaurantId?: string;
  branchName?: string;
  /** Owner/admin email address (shown in Super Admin panel) */
  ownerEmail?: string;
  /** Bank Details for Transfer Orders (Configured by owner in settings) */
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  /** CAC Registration Certificate (Optional upload for basic/pro verification) */
  cacCertificateUrl?: string;
  cacStatus?: 'none' | 'pending' | 'verified' | 'rejected';
  /** Social Reviews & Follow Links (Instagram, TikTok) */
  instagramUrl?: string;
  tiktokUrl?: string;
}

export interface CartItem {
  foodItem: FoodItem;
  quantity: number;
  notes?: string;
  tableNumber?: string;
  /** Per-item: whether this item is eaten here or packed to go */
  itemType?: 'dine_in' | 'takeaway';
  /** Selected Nigerian dish modifiers / extras (Swallow, Protein, Spice, etc.) */
  selectedModifiers?: SelectedModifier[];
  /** Effective unit price = base price + sum of selected modifier prices */
  unitPrice?: number;
}

export interface CustomerProfile {
  id: string;
  restaurantId: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: number;
  lastOrderType?: string;
  favoriteItems: Record<string, number>;
  tags: string[];
  notes?: string;
  createdAt: number;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableNumber: string;
  customerName: string;
  customerPhone?: string;
  items: CartItem[];
  subtotal?: number;
  vat?: number;
  total: number;
  paymentMethod?: 'pos' | 'cash' | 'transfer';
  status: 'pending' | 'preparing' | 'ready' | 'served';
  createdAt: string;
  createdAtTimestamp?: number;
  source: 'nfc' | 'qr' | 'web';
  /** Takeout / Delivery packaging options */
  orderType?: 'dine_in' | 'takeaway' | 'both' | 'delivery';
  packagingFee?: number;
  deliveryFee?: number;
  packCount?: number;
  deliveryAddress?: string;
  /** Bank transfer payment receipt screenshot & verification */
  paymentProofUrl?: string;
  paymentVerified?: boolean;
}

export interface InventoryItem {
  id: string;
  restaurantId: string;
  name: string;
  quantity: number;
  unit: 'kg' | 'packs' | 'liters' | 'pcs' | 'bags' | 'crates' | 'bottles' | 'rolls';
  minThreshold: number;
  costPerUnit: number; // in NGN
  category: 'raw_ingredients' | 'beverages' | 'takeaway_packaging' | 'spices_oils' | 'general';
  lastUpdated: string;
}

export interface ExpenseItem {
  id: string;
  restaurantId: string;
  category: 'salary' | 'supplies' | 'fuel_diesel' | 'gas' | 'electricity' | 'packaging' | 'maintenance' | 'rent' | 'other';
  amount: number; // in NGN
  description: string;
  date: string; // YYYY-MM-DD
  paymentMethod: 'cash' | 'transfer' | 'pos';
  recordedBy?: string;
  createdAt: string;
}

export interface CardOrderRequest {
  id: string;
  restaurantId: string;
  restaurantName: string;
  contactPhone: string;
  quantity: number;
  unitPrice: number; // 7,000 NGN
  totalAmount: number; // quantity * 7,000 NGN
  cardType: 'table_nfc' | 'google_review' | 'whatsapp_link' | 'instagram_social' | 'custom_url';
  targetUrlPayload?: string;
  tableNumbers?: string;
  notes?: string;
  status: 'pending' | 'contacted' | 'fulfilled' | 'cancelled';
  createdAt: string;
}

export interface DailyShift {
  id: string;
  restaurantId: string;
  startedAt: string;
  startedAtTimestamp: number;
  endedAt?: string;
  endedAtTimestamp?: number;
  isActive: boolean;
  totalOrders: number;
  totalRevenue: number;
  totalVat: number;
  totalCustomers: number;
  breakdown: {
    pos: number;
    cash: number;
    transfer: number;
  };
}

export interface WaiterCall {
  id: string;
  restaurantId: string;
  tableNumber: string;
  reason: 'Request Bill' | 'Need Waiter' | 'Water Refill' | 'General';
  timestamp: string;
  status: 'active' | 'resolved';
}
