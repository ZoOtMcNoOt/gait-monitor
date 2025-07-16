import ChartJS from '../chartSetup';

// Mock Chart.js
const mockRegister = jest.fn();
jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn()
  },
  CategoryScale: 'CategoryScale',
  LinearScale: 'LinearScale', 
  PointElement: 'PointElement',
  LineElement: 'LineElement',
  Title: 'Title',
  Tooltip: 'Tooltip',
  Legend: 'Legend',
  TimeScale: 'TimeScale',
  LineController: 'LineController'
}));

// Mock the adapter
jest.mock('chartjs-adapter-date-fns', () => ({}));

describe('chartSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('exports Chart.js as default', () => {
    expect(ChartJS).toBeDefined();
  });

  test('registerChartComponents function exists and can be called', async () => {
    const { registerChartComponents } = await import('../chartSetup');
    
    expect(typeof registerChartComponents).toBe('function');
    
    // Should not throw when called
    expect(() => registerChartComponents()).not.toThrow();
  });

  test('registerChartComponents calls Chart.register', async () => {
    // Clear module cache to get fresh instance
    jest.resetModules();
    
    const Chart = await import('chart.js');
    (Chart.Chart.register as jest.Mock).mockImplementation(mockRegister);
    
    const { registerChartComponents } = await import('../chartSetup');
    
    registerChartComponents();
    
    expect(Chart.Chart.register).toHaveBeenCalledWith(
      'CategoryScale',
      'LinearScale', 
      'PointElement',
      'LineElement',
      'Title',
      'Tooltip',
      'Legend',
      'TimeScale',
      'LineController'
    );
  });

  test('multiple calls to registerChartComponents are safe', async () => {
    jest.resetModules();
    
    const Chart = await import('chart.js');
    (Chart.Chart.register as jest.Mock).mockImplementation(mockRegister);
    
    const { registerChartComponents } = await import('../chartSetup');
    
    // Call multiple times - should be idempotent
    registerChartComponents();
    registerChartComponents();
    registerChartComponents();
    
    // Should only register once due to isRegistered flag
    expect(Chart.Chart.register).toHaveBeenCalledTimes(1);
  });
});
