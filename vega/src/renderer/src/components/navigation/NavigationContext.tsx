import { createContext, useContext } from 'react'

interface NavigationContextValue {
  navigate: (moduleId: string) => void
}

export const NavigationContext = createContext<NavigationContextValue | null>(null)

export function useNavigation(): NavigationContextValue {
  const value = useContext(NavigationContext)
  if (!value) throw new Error('NavigationContext is missing')
  return value
}
