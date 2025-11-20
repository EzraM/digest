import { DebugSidebar } from "../DebugSidebar";

type DebugPaneProps = {
  isVisible: boolean;
  onClose: () => void;
};

export const DebugPane = ({ isVisible, onClose }: DebugPaneProps) => (
  <DebugSidebar isVisible={isVisible} onToggle={onClose} />
);
