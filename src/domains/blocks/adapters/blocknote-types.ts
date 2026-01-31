/**
 * BlockNote Integration Types
 *
 * Types specific to BlockNote editor integration.
 * These are not part of the pure domain core.
 */

import { CustomBlock } from "../../../types/schema";

/**
 * Block change from BlockNote's onChange event
 * Maps to BlockNote 0.14.1's getChanges() API
 * This is BlockNote-specific and uses CustomBlock
 */
export interface BlockChange {
  block: CustomBlock;
  source: {
    type:
      | "local"
      | "paste"
      | "drop"
      | "undo"
      | "redo"
      | "undo-redo"
      | "yjs-remote";
  };
  type: "insert" | "delete" | "update";
  prevBlock?: CustomBlock;
}

/**
 * Maps BlockNote source types to our unified source types
 */
export const BLOCKNOTE_SOURCE_MAP = {
  local: "user",
  paste: "user",
  drop: "user",
  undo: "user",
  redo: "user",
  "undo-redo": "user",
  "yjs-remote": "sync",
} as const;
