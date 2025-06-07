// Define interfaces for state and actions
export interface BrowserState {
  status: "entry" | "page";
  url: string;
}

export interface SetUrlAction {
  type: "set-url";
  url: string;
}

export interface EnterAction {
  type: "enter";
}

export type BrowserAction = SetUrlAction | EnterAction;

// Props interfaces
export interface PageProps {
  blockId: string;
  url?: string;
}

export interface BrowserSlotProps {
  blockId: string;
} 