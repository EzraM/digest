import { randomUUID } from "crypto";
import { CollaborationDocumentService } from "../../../application/CollaborationDocumentService";
import type { DocumentManager } from "../../../services/DocumentManager";
import type {
  InsertNotebookContent,
  NotebookAddress,
  NotebookBlockInput,
  NotebookWriteOrigin,
  NotebookWriteResult,
} from "../core/NotebookAddress";
import { insertBlocksHeadlessly } from "./HeadlessBlockNoteWriter";

const isAddress = (value: unknown): value is NotebookAddress => {
  if (!value || typeof value !== "object") return false;
  const address = value as any;
  if (typeof address.documentId !== "string" || !address.position) return false;
  return (
    address.position.kind === "end" ||
    (address.position.kind === "after-block" &&
      typeof address.position.blockId === "string")
  );
};

const isOrigin = (value: unknown): value is NotebookWriteOrigin => {
  if (!value || typeof value !== "object") return false;
  const origin = value as any;
  return (
    ["page-link", "clip", "image", "download", "agent"].includes(
      origin.source
    ) &&
    typeof origin.capturedAt === "number" &&
    (origin.sourceUrl === undefined || typeof origin.sourceUrl === "string")
  );
};

export class NotebookWriteService {
  constructor(
    private readonly collaboration: CollaborationDocumentService,
    private readonly documents: DocumentManager
  ) {}

  async insertContent(
    command: InsertNotebookContent,
    producerRendererId: number
  ): Promise<NotebookWriteResult> {
    if (
      !command ||
      !isAddress(command.address) ||
      typeof command.requestId !== "string" ||
      !command.requestId.trim() ||
      !Array.isArray(command.blocks) ||
      command.blocks.length === 0 ||
      !command.blocks.every(
        (block) => !!block && typeof block === "object" && !Array.isArray(block)
      ) ||
      !isOrigin(command.origin)
    ) {
      return { status: "rejected", reason: "invalid-content" };
    }

    try {
      this.documents.getDocument(command.address.documentId);
    } catch {
      return { status: "rejected", reason: "document-not-found" };
    }

    const updateId = `notebook-write:${command.requestId}`;
    let outcome;
    try {
      outcome = await this.collaboration.applyCanonicalMutation({
        documentId: command.address.documentId,
        updateId,
        producerRendererId,
        mutate: (doc) =>
          insertBlocksHeadlessly(
            doc,
            command.address.position,
            command.blocks as readonly NotebookBlockInput[],
            randomUUID
          ),
      });
    } catch (error) {
      console.warn("[NotebookWriteService] Rejected invalid content", {
        requestId: command.requestId,
        documentId: command.address.documentId,
        source: command.origin.source,
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: "rejected", reason: "invalid-content" };
    }
    if (outcome.duplicate) {
      return { status: "rejected", reason: "duplicate-request" };
    }

    const insertion = outcome.value!;
    const common = {
      documentId: command.address.documentId,
      insertedBlockIds: insertion.insertedBlockIds,
      resolvedPosition: insertion.resolvedPosition,
      updateId,
    };
    const result: NotebookWriteResult = insertion.reanchored
      ? {
          status: "reanchored",
          ...common,
          requestedPosition: command.address.position,
        }
      : { status: "inserted", ...common };

    console.info("[NotebookWriteService]", {
      requestId: command.requestId,
      documentId: command.address.documentId,
      requestedPosition: command.address.position.kind,
      resolvedPosition: insertion.resolvedPosition.kind,
      source: command.origin.source,
      blockCount: command.blocks.length,
      updateId,
      status: result.status,
    });
    return result;
  }
}
