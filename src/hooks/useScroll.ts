import { useContext } from 'react'
import ScrollContext from '../contexts/ScrollContext'
import type { ScrollContextType } from '../contexts/ScrollContext'

export const useScroll = (): ScrollContextType => {
  const context = useContext(ScrollContext)
  if (context === undefined) {
    throw new Error('useScroll must be used within a ScrollProvider')
  }
  return context
}
