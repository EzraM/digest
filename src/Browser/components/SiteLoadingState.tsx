import React from "react";
import "./SiteLoadingState.css";

type SiteLoadingStateProps = {
  url: string;
};

const getHostname = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Opening page";
  }
};

export const SiteLoadingState = ({ url }: SiteLoadingStateProps) => (
  <div className="site-loading-state" role="status" aria-live="polite">
    <div className="site-loading-mark" aria-hidden="true">
      <span className="site-loading-node site-loading-node--web" />
      <span className="site-loading-thread" />
      <span className="site-loading-node site-loading-node--note" />
      <span className="site-loading-glint" />
    </div>
    <span className="site-loading-host">{getHostname(url)}</span>
  </div>
);
