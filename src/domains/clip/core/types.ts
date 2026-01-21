/**
 * Clip Domain - Pure Core Types
 *
 * Types for web clipping functionality.
 * A "clip" captures web content (selection) and converts it to notebook blocks.
 */

/**
 * Conversion status for a clip draft
 */
export type ConversionStatus = 'pending' | 'converting' | 'completed' | 'failed';

/**
 * Conversion strategy
 */
export type ConversionStrategy = 'deterministic' | 'llm';

/**
 * Conversion state within a draft
 */
export interface ConversionState {
  readonly status: ConversionStatus;
  readonly strategy: ConversionStrategy;
  readonly logs?: readonly string[];
  readonly error?: string;
}

/**
 * Selection context from the source page
 */
export interface SelectionContext {
  readonly frameUrl?: string;
  readonly selectionRect?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/**
 * ClipDraft: transient draft object used for conversion + review
 * Not persisted into the notebook document - lives only until committed
 */
export interface ClipDraft {
  readonly id: string;
  readonly sourceUrl: string;
  readonly sourceTitle: string;
  readonly capturedAt: number; // epoch ms

  // Raw captured content
  readonly selectionText: string;
  readonly selectionHtml: string;

  // Optional context about the selection
  readonly context?: SelectionContext;

  // Conversion state (mutable during processing)
  conversion?: ConversionState;

  // Result of conversion (BlockNote blocks for preview/edit)
  proposedBlocks?: readonly unknown[];
}

/**
 * Payload for creating a new clip draft
 */
export interface ClipCapturePayload {
  readonly sourceUrl: string;
  readonly sourceTitle: string;
  readonly selectionText: string;
  readonly selectionHtml: string;
  readonly context?: SelectionContext;
}

/**
 * Props for the clip container block (persisted in notebook)
 */
export interface ClipBlockProps {
  readonly sourceUrl: string;
  readonly title: string;
}

/**
 * Result of committing a clip to the document
 */
export interface ClipCommitResult {
  readonly clipBlockId: string;
  readonly operationCount: number;
  readonly batchId: string;
}
