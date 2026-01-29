import { createContext, useContext, ReactNode, useState, useCallback } from "react";
import { LinkCaptureNotification } from "../types/linkCapture";

interface LinkCaptureContextType {
  notifications: LinkCaptureNotification[];
  addNotification: (url: string, title: string) => void;
  removeNotification: (id: string) => void;
}

const LinkCaptureContext = createContext<LinkCaptureContextType | null>(null);

export const LinkCaptureProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<LinkCaptureNotification[]>([]);

  const addNotification = useCallback((url: string, title: string) => {
    const notification: LinkCaptureNotification = {
      id: `link-capture-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url,
      title,
      capturedAt: Date.now(),
    };

    setNotifications((prev) => [...prev, notification]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <LinkCaptureContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
      }}
    >
      {children}
    </LinkCaptureContext.Provider>
  );
};

export const useLinkCaptureContext = (): LinkCaptureContextType => {
  const context = useContext(LinkCaptureContext);
  if (!context) {
    throw new Error(
      "useLinkCaptureContext must be used within LinkCaptureProvider"
    );
  }
  return context;
};
