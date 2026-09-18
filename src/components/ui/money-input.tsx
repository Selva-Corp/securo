import * as React from "react";
import { cn } from "@/lib/cn";
import { Input } from "./input";

/**
 * Text input for a currency amount with a leading symbol. The value is a plain
 * decimal string ("12.50"); parse it with parseMoney on the way in.
 */
export function MoneyInput({
  className,
  containerClassName,
  symbol = "$",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { symbol?: string; containerClassName?: string }) {
  return (
    <div className={cn("relative", containerClassName)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted" aria-hidden>
        {symbol}
      </span>
      <Input inputMode="decimal" placeholder="0.00" className={cn("pl-7", className)} {...props} />
    </div>
  );
}
