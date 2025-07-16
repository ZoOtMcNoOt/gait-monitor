import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import DataViewer from '../DataViewer';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../../contexts/ToastContext';

// Mock all external dependencies
jest.mock('../../contexts/ToastContext', () => ({
  useToast: jest.fn(() => ({
    showSuccess: jest.fn(),
    showError: jest.fn(),
    showInfo: jest.fn()
  }))
}))

jest.mock('../../hooks/useTimestampManager', () => ({
  useTimestampManager: jest.fn(() => ({
    convertToLocalTime: jest.fn((timestamp) => timestamp),
    formatTimestamp: jest.fn((timestamp) => new Date(timestamp).toLocaleString()),
    getCurrentTimestamp: jest.fn(() => Date.now())
  }))
}))

jest.mock('../../services/csrfProtection', () => ({
  protectedOperations: {
    withCSRFProtection: jest.fn(),
    requestPermission: jest.fn().mockResolvedValue(true)
  }
}))

jest.mock('@tauri-apps/api/core', () => ({
  invoke: jest.fn()
}))

jest.mock('react-chartjs-2', () => ({
  Line: ({ data }: { data?: { datasets?: { label?: string }[] } }) => (
    <div data-testid="chart-mock">
      Chart: {data?.datasets?.[0]?.label || 'No data'}
    </div>
  ),
  Chart: {
    register: jest.fn(),
  }
}))

jest.mock('../ScrollableContainer', () => {
  return function MockScrollableContainer({ children }: { children: React.ReactNode }) {
    return <div data-testid="scrollable-container">{children}</div>
  }
})

const mockSessionData = {
  session_name: 'Test Session',
  subject_id: 'Test Subject',
  start_time: 1640995200000,
  end_time: 1640995800000,
  metadata: {
    devices: ['device1', 'device2'],
    data_types: ['accelerometer_x', 'accelerometer_y'],
    sample_rate: 100,
    duration: 600
  },
  data: [
    {
      timestamp: 1640995200000,
      device_id: 'device1',
      data_type: 'accelerometer_x',
      value: 0.5,
      unit: 'g'
    },
    {
      timestamp: 1640995200010,
      device_id: 'device2',
      data_type: 'accelerometer_y',
      value: 0.3,
      unit: 'g'
    },
    {
      timestamp: 1640995200020,
      device_id: 'device1',
      data_type: 'accelerometer_x',
      value: 0.7,
      unit: 'g'
    }
  ]
}

describe('DataViewer', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const mockOnClose = jest.fn();
  const mockShowError = jest.fn();
  const mockShowSuccess = jest.fn();
  const mockShowInfo = jest.fn();
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    
    // Suppress console.error during tests to avoid cluttering output
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Set up mock for useToast
    (useToast as jest.Mock).mockReturnValue({
      showError: mockShowError,
      showSuccess: mockShowSuccess,
      showInfo: mockShowInfo
    });

    // Set up default mock for invoke
    (invoke as jest.Mock).mockImplementation((command: string) => {
      if (command === 'load_session_data') {
        return Promise.resolve(mockSessionData);
      }
      return Promise.resolve();
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    consoleSpy.mockRestore();
  });

  const renderComponent = (props: { sessionId: string; sessionName: string; onClose: () => void }) => {
    flushSync(() => {
      root.render(React.createElement(DataViewer, props));
    });
    return new Promise(resolve => setTimeout(resolve, 0));
  };

  describe('Basic Rendering', () => {
    it('should render without crashing', async () => {
      await renderComponent({
        sessionId: "test-session-1",
        sessionName: "Test Session",
        onClose: mockOnClose
      });

      expect(container.querySelector('.data-viewer-overlay')).toBeInTheDocument();
    });

    it('should display session name', async () => {
      await renderComponent({
        sessionId: "test-session-1",
        sessionName: "Test Session",
        onClose: mockOnClose
      });

      expect(container.textContent).toContain('Test Session');
    });

    it('should have close button', async () => {
      await renderComponent({
        sessionId: "test-session-1",
        sessionName: "Test Session",
        onClose: mockOnClose
      });

      const closeButton = container.querySelector('.btn-close');
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe('Data Loading', () => {
    it('should call invoke with correct parameters', async () => {
      await renderComponent({
        sessionId: "test-session-1",
        sessionName: "Test Session",
        onClose: mockOnClose
      });

      expect(invoke).toHaveBeenCalledWith('load_session_data', {
        sessionId: 'test-session-1'
      });
    });

    it('should display session data when loaded', async () => {
      await renderComponent({
        sessionId: "test-session-1",
        sessionName: "Test Session",
        onClose: mockOnClose
      });

      expect(container.textContent).toContain('Test Subject');
    });
  });

  describe('Error Handling', () => {
    it('should handle loading errors gracefully', async () => {
      (invoke as jest.Mock).mockRejectedValue(new Error('Failed to load data'));

      await renderComponent({
        sessionId: "test-session-1",
        sessionName: "Test Session",
        onClose: mockOnClose
      });

      expect(mockShowError).toHaveBeenCalled();
    });

    it('should handle null data gracefully', async () => {
      (invoke as jest.Mock).mockResolvedValue(null);

      await renderComponent({
        sessionId: "test-session-1",
        sessionName: "Test Session",
        onClose: mockOnClose
      });

      // When invoke returns null, it causes an error because the component tries to access null.metadata
      // This is actually the correct behavior - the component should show an error
      expect(container.textContent).toContain('Error Loading Data');
    });
  });

  describe('Close Functionality', () => {
    it('should call onClose when close button is clicked', async () => {
      await renderComponent({
        sessionId: "test-session-1",
        sessionName: "Test Session",
        onClose: mockOnClose
      });

      const closeButton = container.querySelector('.btn-close');
      if (closeButton) {
        closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }

      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});