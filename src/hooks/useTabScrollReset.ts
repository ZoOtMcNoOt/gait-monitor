import { useEffect } from 'react'
import { useScroll } from './useScroll'

/**
 * Hook to automatically scroll all registered containers to top when dependencies change
 * @param dependencies - Values that trigger scroll reset (like page/tab changes)
 * @param delay - Optional delay in ms before scrolling (default: 50ms)
 */
export const useTabScrollReset = (dependencies: unknown[], delay = 50) => {
  const { scrollAllToTop } = useScroll()

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      scrollAllToTop()
    }, delay)

    // Also scroll immediately for responsive feel
    scrollAllToTop()

    return () => clearTimeout(timeoutId)
  }, dependencies) // eslint-disable-line react-hooks/exhaustive-deps
}

export default useTabScrollReset
