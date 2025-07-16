import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import MetadataForm from '../MetadataForm';

describe('MetadataForm', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (root) {
      flushSync(() => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  test('should render form with all fields', () => {
    flushSync(() => {
      root.render(React.createElement(MetadataForm, { onSubmit: mockOnSubmit }));
    });

    expect(container.querySelector('#sessionName')).toBeTruthy();
    expect(container.querySelector('#subjectId')).toBeTruthy();
    expect(container.querySelector('#notes')).toBeTruthy();
    expect(container.querySelector('button[type="submit"]')).toBeTruthy();
  });

  test('should render without submit button when onSubmit is not provided', () => {
    flushSync(() => {
      root.render(React.createElement(MetadataForm, {}));
    });

    expect(container.querySelector('#sessionName')).toBeTruthy();
    expect(container.querySelector('#subjectId')).toBeTruthy();
    expect(container.querySelector('#notes')).toBeTruthy();
    expect(container.querySelector('button[type="submit"]')).toBeNull();
  });

  test('should display form labels and placeholders', () => {
    flushSync(() => {
      root.render(React.createElement(MetadataForm, { onSubmit: mockOnSubmit }));
    });

    const sessionNameLabel = container.querySelector('label[for="sessionName"]');
    const subjectIdLabel = container.querySelector('label[for="subjectId"]');
    const notesLabel = container.querySelector('label[for="notes"]');
    
    expect(sessionNameLabel?.textContent).toBe('Session Name *');
    expect(subjectIdLabel?.textContent).toBe('Subject ID *');
    expect(notesLabel?.textContent).toBe('Notes');

    const sessionNameInput = container.querySelector('#sessionName') as HTMLInputElement;
    const subjectIdInput = container.querySelector('#subjectId') as HTMLInputElement;
    const notesInput = container.querySelector('#notes') as HTMLTextAreaElement;

    expect(sessionNameInput.placeholder).toBe('e.g., Morning Walk Test');
    expect(subjectIdInput.placeholder).toBe('e.g., SUBJ001');
    expect(notesInput.placeholder).toBe('Additional notes about this session...');
  });

  test('should have required attributes on required fields', () => {
    flushSync(() => {
      root.render(React.createElement(MetadataForm, { onSubmit: mockOnSubmit }));
    });

    const sessionNameInput = container.querySelector('#sessionName') as HTMLInputElement;
    const subjectIdInput = container.querySelector('#subjectId') as HTMLInputElement;
    const notesInput = container.querySelector('#notes') as HTMLTextAreaElement;

    expect(sessionNameInput.hasAttribute('required')).toBe(true);
    expect(subjectIdInput.hasAttribute('required')).toBe(true);
    expect(notesInput.hasAttribute('required')).toBe(false);
  });

  test('should have proper form structure', () => {
    flushSync(() => {
      root.render(React.createElement(MetadataForm, { onSubmit: mockOnSubmit }));
    });

    const form = container.querySelector('form');
    const formGroups = container.querySelectorAll('.form-group');
    const inputs = container.querySelectorAll('input, textarea');
    
    expect(form).toBeTruthy();
    expect(formGroups.length).toBe(3);
    expect(inputs.length).toBe(3);
  });

  test('should render session metadata heading', () => {
    flushSync(() => {
      root.render(React.createElement(MetadataForm, { onSubmit: mockOnSubmit }));
    });

    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('Session Metadata');
  });

  test('should have proper input types', () => {
    flushSync(() => {
      root.render(React.createElement(MetadataForm, { onSubmit: mockOnSubmit }));
    });

    const sessionNameInput = container.querySelector('#sessionName') as HTMLInputElement;
    const subjectIdInput = container.querySelector('#subjectId') as HTMLInputElement;
    const notesInput = container.querySelector('#notes') as HTMLTextAreaElement;

    expect(sessionNameInput.type).toBe('text');
    expect(subjectIdInput.type).toBe('text');
    expect(notesInput.tagName.toLowerCase()).toBe('textarea');
    expect(notesInput.rows).toBe(3);
  });

  test('should display continue button with correct text', () => {
    flushSync(() => {
      root.render(React.createElement(MetadataForm, { onSubmit: mockOnSubmit }));
    });

    const submitButton = container.querySelector('button[type="submit"]');
    expect(submitButton?.textContent).toBe('Continue to Data Collection');
    expect(submitButton?.classList.contains('btn-primary')).toBe(true);
  });

  test('should render form in a card section', () => {
    flushSync(() => {
      root.render(React.createElement(MetadataForm, { onSubmit: mockOnSubmit }));
    });

    const cardSection = container.querySelector('section.card');
    expect(cardSection).toBeTruthy();
  });

  test('should have proper label-input associations', () => {
    flushSync(() => {
      root.render(React.createElement(MetadataForm, { onSubmit: mockOnSubmit }));
    });

    const sessionNameLabel = container.querySelector('label[for="sessionName"]');
    const subjectIdLabel = container.querySelector('label[for="subjectId"]');
    const notesLabel = container.querySelector('label[for="notes"]');
    
    const sessionNameInput = container.querySelector('#sessionName');
    const subjectIdInput = container.querySelector('#subjectId');
    const notesInput = container.querySelector('#notes');

    expect(sessionNameLabel).toBeTruthy();
    expect(subjectIdLabel).toBeTruthy();
    expect(notesLabel).toBeTruthy();
    expect(sessionNameInput).toBeTruthy();
    expect(subjectIdInput).toBeTruthy();
    expect(notesInput).toBeTruthy();
  });

  test('should include custom CSS styles', () => {
    flushSync(() => {
      root.render(React.createElement(MetadataForm, { onSubmit: mockOnSubmit }));
    });

    const styleElement = container.querySelector('style');
    expect(styleElement).toBeTruthy();
    expect(styleElement?.textContent).toContain('.error');
    expect(styleElement?.textContent).toContain('.error-message');
  });

  test('should render all form groups with proper structure', () => {
    flushSync(() => {
      root.render(React.createElement(MetadataForm, { onSubmit: mockOnSubmit }));
    });

    const formGroups = container.querySelectorAll('.form-group');
    
    formGroups.forEach(group => {
      const label = group.querySelector('label');
      const input = group.querySelector('input, textarea');
      
      expect(label).toBeTruthy();
      expect(input).toBeTruthy();
    });
  });
});
