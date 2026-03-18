import { createContext, useContext } from 'react';

type ToastProps = {
  title: string;
  description: string;
  status: 'success' | 'error' | 'info';
};

const ToastContext = createContext<(props: ToastProps) => void>(() => {});

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const showToast = (props: ToastProps) => {
    alert(`${props.status.toUpperCase()}: ${props.title} - ${props.description}`);
  };

  return <ToastContext.Provider value={showToast}>{children}</ToastContext.Provider>;
};
