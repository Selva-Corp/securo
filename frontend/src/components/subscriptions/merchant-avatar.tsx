import { useState } from 'react'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/subscription-utils'

interface MerchantAvatarProps {
  name: string
  logoUrl?: string | null
  className?: string
}

/**
 * Merchant logo with an initials fallback. The logo comes from the payee's
 * website favicon when one is set; most detected subscriptions have no payee
 * yet, so the fallback is the common case and has to look intentional.
 */
export function MerchantAvatar({ name, logoUrl, className }: MerchantAvatarProps) {
  const [failed, setFailed] = useState(false)
  const showLogo = Boolean(logoUrl) && !failed

  return (
    <div
      className={cn(
        'size-10 shrink-0 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden',
        className,
      )}
      aria-hidden="true"
    >
      {showLogo ? (
        <img
          src={logoUrl ?? undefined}
          alt=""
          className="size-full object-contain p-1.5"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-sm font-semibold text-muted-foreground select-none">{initials(name)}</span>
      )}
    </div>
  )
}
