export type BrowserLoadStatus = "loading" | "loaded" | "error";

export type LiveReference = { profileId: string; url: string };

export type LivePagesProjection = {
  revision: number;
  references: LiveReference[];
};

export type BrowserLifecycleEvent =
  | {
      blockId: string;
      success: true;
      status: Exclude<BrowserLoadStatus, "error">;
    }
  | {
      blockId: string;
      success: false;
      status: "error";
      error: string;
      errorCode: number;
      errorDescription: string;
    };

export type BrowserPageInfo =
  | {
      success: true;
      url: string;
      title: string;
      loadStatus: BrowserLoadStatus;
    }
  | {
      success: false;
      error: string;
    };
