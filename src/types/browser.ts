export type BrowserLoadStatus = "loading" | "loaded" | "error";

export type LiveReference = { profileId: string; url: string };

export type LivePagesProjection = {
  revision: number;
  references: LiveReference[];
};

export type BrowserPresentationIdentity = {
  routeId: string;
  placementId: string;
  journeyId: string;
  handleId: string;
  transitionGeneration: number;
};

/** Renderer-to-main request. Main converts this IPC naming at the boundary. */
export type OpenReferenceIPCRequest = {
  placementId: string;
  routeId: string;
  blockId: string;
  url: string;
  bounds: { x: number; y: number; width: number; height: number };
  profileId: string;
  layout: "inline" | "full";
  referenceKind: "site-block" | "ephemeral-url";
  placementGeneration: number;
  transitionGeneration: number;
};

export type DetachPlacementIPCRequest = {
  placementId: string;
  placementGeneration: number;
  transitionGeneration: number;
};

export type BrowserLifecycleEvent =
  | {
      blockId: string;
      success: true;
      status: Exclude<BrowserLoadStatus, "error">;
      presentation?: BrowserPresentationIdentity;
    }
  | {
      blockId: string;
      success: false;
      status: "error";
      error: string;
      errorCode: number;
      errorDescription: string;
      presentation?: BrowserPresentationIdentity;
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
