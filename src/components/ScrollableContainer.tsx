import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import type { ReactNode } from 'react'
import { useScroll } from '../hooks/useScroll'

interface ScrollableContainerProps {
  children: ReactNode
  className?: string
  id: string
}

export interface ScrollableContainerRef {
  scrollToTop: () => void
  element: HTMLElement | null
}

const ScrollableContainer = forwardRef<ScrollableContainerRef, ScrollableContainerProps>(
  ({ children, className = '', id }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const { registerScrollable, unregisterScrollable } = useScroll()

    useImperativeHandle(ref, () => ({
      scrollToTop: () => {
        if (containerRef.current) {
          containerRef.current.scrollTo({ top: 0, behavior: 'instant' })
        }
      },
      element: containerRef.current,
    }))

    useEffect(() => {
      registerScrollable(id, containerRef.current)

      return () => {
        unregisterScrollable(id)
      }
    }, [id, registerScrollable, unregisterScrollable])

    return (
      <div ref={containerRef} className={className}>
        {children}
      </div>
    )
  },
)

ScrollableContainer.displayName = 'ScrollableContainer'

export default ScrollableContainer
