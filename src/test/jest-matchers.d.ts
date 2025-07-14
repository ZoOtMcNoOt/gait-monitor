// Custom Jest matchers type declarations
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R
      toHaveClass(className: string): R
    }
  }
}

export {}
