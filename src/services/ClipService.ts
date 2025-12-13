import { ClipDraft } from "../types/clip";
import { log } from "../utils/rendererLogger";

/**
 * Service for managing clip drafts in-memory
 * Bootstrap: in-memory only (can be persisted to SQLite later)
 */
export class ClipService {
  private static instance: ClipService;
  private drafts: Map<string, ClipDraft> = new Map();

  public static getInstance(): ClipService {
    if (!ClipService.instance) {
      ClipService.instance = new ClipService();
    }
    return ClipService.instance;
  }

  /**
   * Create a new clip draft from selection payload
   */
  createDraft(payload: {
    sourceUrl: string;
    sourceTitle: string;
    selectionText: string;
    selectionHtml: string;
    context?: ClipDraft["context"];
  }): ClipDraft {
    const draft: ClipDraft = {
      id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceUrl: payload.sourceUrl,
      sourceTitle: payload.sourceTitle,
      capturedAt: Date.now(),
      selectionText: payload.selectionText,
      selectionHtml: payload.selectionHtml,
      context: payload.context,
      conversion: {
        status: "pending",
        strategy: "deterministic",
      },
    };

    this.drafts.set(draft.id, draft);
    log.debug(`Created clip draft: ${draft.id}`, "ClipService");
    return draft;
  }

  /**
   * Get a draft by ID
   */
  getDraft(id: string): ClipDraft | undefined {
    return this.drafts.get(id);
  }

  /**
   * Get all drafts
   */
  getAllDrafts(): ClipDraft[] {
    return Array.from(this.drafts.values());
  }

  /**
   * Update a draft
   */
  updateDraft(id: string, updates: Partial<ClipDraft>): ClipDraft | null {
    const draft = this.drafts.get(id);
    if (!draft) {
      log.debug(`Draft not found: ${id}`, "ClipService");
      return null;
    }

    const updated = { ...draft, ...updates };
    this.drafts.set(id, updated);
    log.debug(`Updated clip draft: ${id}`, "ClipService");
    return updated;
  }

  /**
   * Delete a draft
   */
  deleteDraft(id: string): boolean {
    const deleted = this.drafts.delete(id);
    if (deleted) {
      log.debug(`Deleted clip draft: ${id}`, "ClipService");
    }
    return deleted;
  }

  /**
   * Clear all drafts
   */
  clearAll(): void {
    this.drafts.clear();
    log.debug("Cleared all clip drafts", "ClipService");
  }
}



