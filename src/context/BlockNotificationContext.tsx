import { createContext, useContext, ReactNode } from "react";
import { useBlockNotification } from "../hooks/useBlockNotification";

type BlockNotificationContextType = {
  pendingBlockIds: string[];
  triggerNotification: (blockId: string) => void;
  removeNotification: (blockId: string) => void;
};

export const BlockNotificationContext =
  createContext<BlockNotificationContextType | null>(null);

export const BlockNotificationProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const notificationState = useBlockNotification();

  // Ensure we always provide a valid context value
  if (!notificationState) {
    throw new Error(
      "BlockNotificationProvider: useBlockNotification returned undefined"
    );
  }

  return (
    <BlockNotificationContext.Provider value={notificationState}>
      {children}
    </BlockNotificationContext.Provider>
  );
};

export const useBlockNotificationContext = () => {
  const context = useContext(BlockNotificationContext);
  if (!context) {
    throw new Error(
      "useBlockNotificationContext must be used within BlockNotificationProvider"
    );
  }
  return context;
};
