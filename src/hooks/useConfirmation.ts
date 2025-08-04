import { useState, useCallback } from 'react'

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'warning' | 'danger' | 'info';
}

export interface TypedConfirmationOptions extends ConfirmationOptions {
  requiredPhrase: string;
}

export interface ConfirmationState extends ConfirmationOptions {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface TypedConfirmationState extends TypedConfirmationOptions {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const useConfirmation = () => {
  const [confirmationState, setConfirmationState] = useState<ConfirmationState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: () => {}
  });

  const [typedConfirmationState, setTypedConfirmationState] = useState<TypedConfirmationState>({
    isOpen: false,
    title: '',
    message: '',
    requiredPhrase: '',
    onConfirm: () => {},
    onCancel: () => {}
  });

  const showConfirmation = useCallback((
    options: ConfirmationOptions
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmationState({
        ...options,
        isOpen: true,
        onConfirm: () => {
          setConfirmationState(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setConfirmationState(prev => ({ ...prev, isOpen: false }));
          resolve(false);
        }
      });
    });
  }, []);

  const showTypedConfirmation = useCallback((
    options: TypedConfirmationOptions
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setTypedConfirmationState({
        ...options,
        isOpen: true,
        onConfirm: () => {
          setTypedConfirmationState(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setTypedConfirmationState(prev => ({ ...prev, isOpen: false }));
          resolve(false);
        }
      });
    });
  }, []);

  const closeConfirmation = useCallback(() => {
    setConfirmationState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const closeTypedConfirmation = useCallback(() => {
    setTypedConfirmationState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return {
    confirmationState,
    typedConfirmationState,
    showConfirmation,
    showTypedConfirmation,
    closeConfirmation,
    closeTypedConfirmation
  };
};
