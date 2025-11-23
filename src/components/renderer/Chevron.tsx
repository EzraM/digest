export const Chevron = ({ direction }: { direction: "left" | "right" }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d={
        direction === "left" ? "M8.5 2.5 4.5 7l4 4.5" : "M5.5 2.5 9.5 7l-4 4.5"
      }
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
