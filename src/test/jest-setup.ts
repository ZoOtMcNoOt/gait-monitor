// Fix for the getConfig issue in @testing-library/dom
// This uses a direct approach to solve the issue

// Override the problematic internal module path
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).getConfig = () => ({
  testIdAttribute: 'data-testid'
})

// Set up the environment to avoid the getConfig issue
const originalModule = jest.requireActual('@testing-library/dom')
if (originalModule && typeof originalModule.configure === 'function') {
  originalModule.configure({ testIdAttribute: 'data-testid' })
}
