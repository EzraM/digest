import "./StatusBar.css";

type StatusBarProps = {
  breadcrumbText: string;
  onClick: () => void;
};

export const StatusBar = ({ breadcrumbText, onClick }: StatusBarProps) => {
  return (
    <header className="app-title-bar notebook-title-bar">
      <button
        className="app-title-bar__control notebook-title-bar__location"
        type="button"
        onClick={onClick}
        title={`${breadcrumbText} — toggle sidebar`}
        aria-label={`${breadcrumbText}. Toggle sidebar`}
      >
        <svg
          className="notebook-title-bar__icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path d="M4.25 2.5h6A1.75 1.75 0 0 1 12 4.25v8.25H5.75A1.75 1.75 0 0 1 4 10.75V2.5h.25Z" />
          <path d="M4 10.75c0-.97.78-1.75 1.75-1.75H12M6.5 5.25h3" />
        </svg>
        <span className="notebook-title-bar__breadcrumb">
          {breadcrumbText}
        </span>
        <svg
          className="notebook-title-bar__reveal"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path d="m6 4 4 4-4 4" />
        </svg>
      </button>
    </header>
  );
};
