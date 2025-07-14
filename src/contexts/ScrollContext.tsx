import React, { createContext, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'

interface ScrollableRef {
  element: HTMLElement | null
  scrollToTop: () => void
}

interface ScrollContextType {
  registerScrollable: (id: string, element: HTMLElement | null) => void
  unregisterScrollable: (id: string) => void
  scrollAllToTop: () => void
  scrollToTop: (id: string) => void
}

export type { ScrollContextType }

const ScrollContext = createContext<ScrollContextType | undefined>(undefined)

interface ScrollProviderProps {
  children: ReactNode
}

export const ScrollProvider: React.FC<ScrollProviderProps> = ({ children }) => {
  const scrollableRefs = useRef<Map<string, ScrollableRef>>(new Map())

  const registerScrollable = useCallback((id: string, element: HTMLElement | null) => {
    if (element) {
      const scrollToTop = () => {
        element.scrollTo({ top: 0, behavior: 'instant' })
      }
      
      scrollableRefs.current.set(id, { element, scrollToTop })
    } else {
      scrollableRefs.current.delete(id)
    }
  }, [])

  const unregisterScrollable = useCallback((id: string) => {
    scrollableRefs.current.delete(id)
  }, [])

  const scrollToTop = useCallback((id: string) => {
    const scrollable = scrollableRefs.current.get(id)
    if (scrollable) {
      scrollable.scrollToTop()
    }
  }, [])

  const scrollAllToTop = useCallback(() => {
    // Scroll all registered scrollable elements
    scrollableRefs.current.forEach(({ scrollToTop }) => {
      scrollToTop()
    })

    // Also scroll window and document as fallback
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.body.scrollTop = 0
    document.documentElement.scrollTop = 0
  }, [])

  const value: ScrollContextType = {
    registerScrollable,
    unregisterScrollable,
    scrollAllToTop,
    scrollToTop,
  }

  return (
    <ScrollContext.Provider value={value}>
      {children}
    </ScrollContext.Provider>
  )
}

export default ScrollContext
