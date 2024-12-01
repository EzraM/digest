import { WebContentsView, BrowserWindow } from "electron";

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BlockView {
  url?: string;
  bounds?: ViewBounds;
  contents?: WebContentsView;
}

export interface BlockViewState {
  [key: string]: BlockView;
}

export interface OverlayState {
  overlay?: WebContentsView;
}

export interface LayoutEvent {
  type: "set-layout";
  blockId: string;
  bounds: ViewBounds;
}

export interface UrlEvent {
  type: "set-url";
  blockId: string;
  url: string;
}

export type BlockEvent = LayoutEvent | UrlEvent;
