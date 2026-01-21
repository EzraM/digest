/**
 * Clip Domain - Service Interfaces
 *
 * Contracts for clip-related services.
 */

import { ClipDraft, ClipCapturePayload, ClipCommitResult } from './types';

/**
 * Manages clip draft lifecycle (in-memory storage)
 */
export interface IClipDraftStore {
  /**
   * Create a new draft from captured selection
   */
  createDraft(payload: ClipCapturePayload): ClipDraft;

  /**
   * Get a draft by ID
   */
  getDraft(id: string): ClipDraft | undefined;

  /**
   * Get all drafts
   */
  getAllDrafts(): ClipDraft[];

  /**
   * Update a draft
   */
  updateDraft(id: string, updates: Partial<ClipDraft>): ClipDraft | null;

  /**
   * Delete a draft
   */
  deleteDraft(id: string): boolean;

  /**
   * Clear all drafts
   */
  clearAll(): void;
}

/**
 * Converts HTML/text to BlockNote blocks
 */
export interface IClipConverter {
  /**
   * Convert a clip draft's HTML/text into proposed BlockNote blocks
   * Updates the draft's conversion state and proposedBlocks
   */
  convertToBlocks(draft: ClipDraft): Promise<unknown[]>;
}

/**
 * Commits clip drafts to the document as block operations
 */
export interface IClipCommitter {
  /**
   * Convert a clip draft to block operations for insertion
   */
  createCommitOperations(
    draft: ClipDraft,
    insertAfterBlockId?: string
  ): Promise<ClipCommitResult & { operations: unknown[]; origin: unknown }>;
}

/**
 * High-level clip workflow coordinator
 */
export interface IClipWorkflow {
  /**
   * Capture a selection and create a draft
   */
  capture(payload: ClipCapturePayload): Promise<ClipDraft>;

  /**
   * Convert a draft to blocks (prepares for preview)
   */
  convert(draftId: string): Promise<ClipDraft>;

  /**
   * Commit a draft to the document
   */
  commit(draftId: string, insertAfterBlockId?: string): Promise<ClipCommitResult>;

  /**
   * Discard a draft
   */
  discard(draftId: string): void;
}
