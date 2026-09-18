import {
  Banknote,
  Car,
  Clapperboard,
  Coins,
  CreditCard,
  HeartPulse,
  Home,
  LifeBuoy,
  Plane,
  Repeat,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Utensils,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Icon names a category can carry (Category.icon). Unknown names fall back to a tag. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  home: Home,
  "shopping-cart": ShoppingCart,
  zap: Zap,
  car: Car,
  shield: Shield,
  "heart-pulse": HeartPulse,
  wifi: Wifi,
  utensils: Utensils,
  clapperboard: Clapperboard,
  "shopping-bag": ShoppingBag,
  repeat: Repeat,
  plane: Plane,
  sparkles: Sparkles,
  "life-buoy": LifeBuoy,
  "trending-up": TrendingUp,
  "credit-card": CreditCard,
  target: Target,
  banknote: Banknote,
  coins: Coins,
  tag: Tag,
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

export function CategoryIcon({ name, className = "h-4 w-4" }: { name: string | null | undefined; className?: string }) {
  const Icon = (name && CATEGORY_ICONS[name]) || Tag;
  return <Icon className={className} aria-hidden />;
}
