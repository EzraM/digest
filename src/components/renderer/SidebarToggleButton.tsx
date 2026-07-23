import "./SidebarToggleButton.css";

const SidebarIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <rect
      x="2.5"
      y="3"
      width="11"
      height="10"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path d="M6 3.5v9" stroke="currentColor" strokeWidth="1.25" />
    <path
      d="M3.25 4h2v8h-2z"
      fill="currentColor"
      opacity={isOpen ? 0.28 : 0.1}
    />
  </svg>
);

type SidebarToggleButtonProps = {
  isOpen: boolean;
  onToggle: () => void;
};

export const SidebarToggleButton = ({
  isOpen,
  onToggle,
}: SidebarToggleButtonProps) => {
  return (
    <button
      className="notebook-rail-toggle"
      type="button"
      onClick={onToggle}
      title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
      aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
    >
      <span>
        <SidebarIcon isOpen={isOpen} />
      </span>
    </button>
  );
};
