import { WebContentsView } from "electron";

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
  profileId: string;
  partition?: string;
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

export interface RemoveEvent {
  type: "remove-view";
  blockId: string;
}

export type BlockEvent = LayoutEvent | UrlEvent | RemoveEvent;

export type BlockViewUpdateEvent = {
  type: "update-block-view";
  blockId: string;
  url: string;
  bounds: { x: number; y: number; width: number; height: number };
  profileId: string;
  partition?: string;
};
