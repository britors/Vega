import { createContext, useContext } from 'react'
import type { SystemModule } from '../../../../main/system/types'

interface NavigationContextValue {
  navigate: (moduleId: SystemModule) => void
}

export const NavigationContext = createContext<NavigationContextValue | null>(null)

export function useNavigation(): NavigationContextValue {
  const value = useContext(NavigationContext)
  if (!value) throw new Error('NavigationContext is missing')
  return value
}
