import { lazy } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'

// Lazy on both sides so a phone never downloads the desktop dashboard's
// chart bundle and a desktop never downloads the phone screen.
const DashboardPage = lazy(() => import('@/pages/dashboard'))
const MobileHomePage = lazy(() => import('@/pages/mobile-home'))

/** `/` renders the phone home screen below `md`, the desktop dashboard above. */
export default function HomeRoute() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileHomePage /> : <DashboardPage />
}
