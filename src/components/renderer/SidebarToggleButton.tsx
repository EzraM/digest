type SidebarToggleButtonProps = {
  isOpen: boolean;
  onToggle: () => void;
};

export const SidebarToggleButton = ({
  isOpen,
  onToggle,
}: SidebarToggleButtonProps) => (
  <button
    type="button"
    onClick={onToggle}
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      width: "2rem",
      height: "100%",
      border: "none",
      borderRight: "1px solid #e0e0e0",
      backgroundColor: "#e7f5ff",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      transition: "background-color 150ms ease",
    }}
    title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
    aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = "#d0ebff";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = "#e7f5ff";
    }}
  >
    <span
      style={{
        color: "#1c7ed6",
        fontSize: "14px",
        fontWeight: 600,
        writingMode: "vertical-rl",
        textOrientation: "mixed",
        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
        userSelect: "none",
        transition: "transform 180ms ease",
      }}
    >
      ‹
    </span>
  </button>
);
