/**
 * ClipDraft: transient draft object used for conversion + review
 * Not persisted into the notebook document
 */
export interface ClipDraft {
  id: string;
  sourceUrl: string;
  sourceTitle: string;
  capturedAt: number; // epoch ms
  selectionText: string; // plain text (best-effort)
  selectionHtml: string; // raw selection HTML (best-effort)
  context?: {
    frameUrl?: string;
    selectionRect?: { x: number; y: number; width: number; height: number };
  };
  conversion?: {
    status: "pending" | "converting" | "completed" | "failed";
    strategy: "deterministic" | "llm";
    logs?: string[];
    error?: string;
  };
  proposedBlocks?: unknown[]; // BlockNote block JSON for preview/edit (once converted)
}

/**
 * Clip block props (for the container block)
 */
export interface ClipBlockProps {
  sourceUrl: string;
  title: string;
}
