import { createContext } from 'react';

export type ToastProps = {
  title: string;
  description: string;
  status: 'success' | 'error' | 'info';
};

export const ToastContext = createContext<(props: ToastProps) => void>(() => {});
