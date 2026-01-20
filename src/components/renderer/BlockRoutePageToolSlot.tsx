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
        backgroundColor: "#fff",
        borderTop: "1px solid #e0e0e0",
        overflow: "hidden",
      }}
    >
      {content}
    </div>
  );
};
