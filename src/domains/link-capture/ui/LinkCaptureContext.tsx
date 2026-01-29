import { createContext, useContext, ReactNode, useReducer, useCallback } from "react";
import { LinkCaptureNotification } from "../core/types";
import { linkCaptureReducer, initialState } from "../core/reducer";
import * as commands from "../core/commands";
import * as selectors from "../core/selectors";

interface LinkCaptureContextType {
  notifications: LinkCaptureNotification[];
  addNotification: (url: string, title: string) => void;
  removeNotification: (id: string) => void;
  removeAllNotifications: () => void;
  notificationCount: number;
  hasNotifications: boolean;
}

const LinkCaptureContext = createContext<LinkCaptureContextType | null>(null);

export const LinkCaptureProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(linkCaptureReducer, initialState);

  const addNotification = useCallback((url: string, title: string) => {
    dispatch(commands.capture(url, title));
  }, []);

  const removeNotification = useCallback((id: string) => {
    dispatch(commands.dismiss(id));
  }, []);

  const removeAllNotifications = useCallback(() => {
    dispatch(commands.dismissAll());
  }, []);

  return (
    <LinkCaptureContext.Provider
      value={{
        notifications: selectors.getNotifications(state),
        addNotification,
        removeNotification,
        removeAllNotifications,
        notificationCount: selectors.getNotificationCount(state),
        hasNotifications: selectors.hasNotifications(state),
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
