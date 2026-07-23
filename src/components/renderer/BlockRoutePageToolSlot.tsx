import React from "react";

type BlockRoutePageToolSlotProps = {
  content: React.ReactNode;
  isVisible: boolean;
};

export const BlockRoutePageToolSlot = ({
  content,
  isVisible,
}: BlockRoutePageToolSlotProps) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div
      style={{
        backgroundColor: "var(--digest-chrome-surface)",
        borderTop: "1px solid var(--digest-chrome-menu-edge)",
        overflow: "hidden",
      }}
    >
      {content}
    </div>
  );
};
