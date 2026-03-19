import { ToastContext, type ToastProps } from './toast-context';

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const showToast = (props: ToastProps) => {
    alert(`${props.status.toUpperCase()}: ${props.title} - ${props.description}`);
  };

  return <ToastContext.Provider value={showToast}>{children}</ToastContext.Provider>;
};
