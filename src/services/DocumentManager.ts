import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { DEFAULT_PROFILE_ID } from "../config/profiles";
import { DocumentRecord, DocumentTreeNode } from "../types/documents";
import { log } from "../utils/mainLogger";
import { ProfileManager } from "./ProfileManager";
import { BlockOperationService } from "./BlockOperationService";

export interface CreateDocumentOptions {
  title?: string | null;
  parentDocumentId?: string | null;
  position?: number;
  documentId?: string;
}

export class DocumentManager {
  private documents = new Map<string, DocumentRecord>();
  private activeDocumentId: string | null = null;
  private blockOperationServices = new Map<string, BlockOperationService>();

  constructor(
    private database: Database.Database,
    private profileManager: ProfileManager
  ) {
    this.loadDocumentsFromDatabase();
    this.ensureDefaultDocument();
    this.ensureActiveDocument();
  }

  get activeDocument(): DocumentRecord | null {
    if (!this.activeDocumentId) return null;
    return this.documents.get(this.activeDocumentId) ?? null;
  }

  getDocument(documentId: string): DocumentRecord {
    const doc = this.documents.get(documentId);
    if (!doc) {
      throw new Error(`Document not found: ${documentId}`);
    }
    return doc;
  }

  listDocuments(profileId?: string): DocumentRecord[] {
    return Array.from(this.documents.values()).filter((doc) => {
      if (doc.deletedAt) return false;
      if (profileId) return doc.profileId === profileId;
      return true;
    });
  }

  getDocumentTree(profileId: string): DocumentTreeNode[] {
    const documents = this.listDocuments(profileId);
    const nodeMap = new Map<string, DocumentTreeNode>();

    for (const doc of documents) {
      nodeMap.set(doc.id, { document: doc, children: [] });
    }

    const roots: DocumentTreeNode[] = [];

    const sortNodes = (nodes: DocumentTreeNode[]) => {
      nodes.sort((a, b) => a.document.position - b.document.position);
      nodes.forEach((node) => sortNodes(node.children));
    };

    for (const doc of documents) {
      const node = nodeMap.get(doc.id)!;
      if (doc.parentDocumentId && nodeMap.has(doc.parentDocumentId)) {
        nodeMap.get(doc.parentDocumentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    sortNodes(roots);
    return roots;
  }

  createDocument(
    profileId: string,
    title?: string | null,
    options: CreateDocumentOptions = {}
  ): DocumentRecord {
    this.profileManager.getProfile(profileId);

    const now = Date.now();
    const documentId = options.documentId ?? randomUUID();
    const parentId = options.parentDocumentId ?? null;
    const position =
      options.position ?? this.getNextSiblingPosition(profileId, parentId);
    const resolvedTitle = title ?? "Untitled Document";

    const stmt = this.database.prepare(
      `INSERT INTO documents (id, title, created_at, updated_at, block_count, profile_id, parent_document_id, position, is_expanded, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)`
    );

    stmt.run(
      documentId,
      resolvedTitle,
      now,
      now,
      0,
      profileId,
      parentId,
      position
    );

    const document: DocumentRecord = {
      id: documentId,
      title: resolvedTitle,
      createdAt: now,
      updatedAt: now,
      blockCount: 0,
      profileId,
      parentDocumentId: parentId,
      position,
      isExpanded: true,
      deletedAt: null,
    };

    this.documents.set(documentId, document);
    log.debug(
      `Created document ${documentId} (${resolvedTitle})`,
      "DocumentManager"
    );

    if (!this.activeDocumentId) {
      this.activeDocumentId = documentId;
    }

    return document;
  }

  renameDocument(documentId: string, title: string): DocumentRecord {
    const document = this.getDocument(documentId);
    const now = Date.now();

    const stmt = this.database.prepare(
      `UPDATE documents SET title = ?, updated_at = ? WHERE id = ?`
    );
    stmt.run(title, now, documentId);

    const updated: DocumentRecord = { ...document, title, updatedAt: now };
    this.documents.set(documentId, updated);
    return updated;
  }

  async deleteDocument(documentId: string): Promise<void> {
    const document = this.getDocument(documentId);
    const now = Date.now();

    const stmt = this.database.prepare(
      `UPDATE documents SET deleted_at = ?, updated_at = ? WHERE id = ?`
    );
    stmt.run(now, now, documentId);

    this.documents.set(documentId, { ...document, deletedAt: now, updatedAt: now });

    if (this.activeDocumentId === documentId) {
      const fallback = this.listDocuments(document.profileId).find(
        (doc) => doc.id !== documentId
      );
      this.activeDocumentId = fallback ? fallback.id : null;
    }
  }

  moveDocument(
    documentId: string,
    newParentId: string | null,
    position: number
  ): DocumentRecord {
    const document = this.getDocument(documentId);
    const stmt = this.database.prepare(
      `UPDATE documents SET parent_document_id = ?, position = ?, updated_at = ? WHERE id = ?`
    );

    const now = Date.now();
    stmt.run(newParentId, position, now, documentId);

    const updated: DocumentRecord = {
      ...document,
      parentDocumentId: newParentId,
      position,
      updatedAt: now,
    };

    this.documents.set(documentId, updated);
    return updated;
  }

  moveDocumentToProfile(
    documentId: string,
    newProfileId: string
  ): DocumentRecord {
    const document = this.getDocument(documentId);
    this.profileManager.getProfile(newProfileId);

    const stmt = this.database.prepare(
      `UPDATE documents SET profile_id = ?, parent_document_id = NULL, position = ?, updated_at = ? WHERE id = ?`
    );

    const now = Date.now();
    const position = this.getNextSiblingPosition(newProfileId, null);
    stmt.run(newProfileId, position, now, documentId);

    const updated: DocumentRecord = {
      ...document,
      profileId: newProfileId,
      parentDocumentId: null,
      position,
      updatedAt: now,
    };
    this.documents.set(documentId, updated);
    return updated;
  }

  switchDocument(documentId: string): DocumentRecord {
    const document = this.getDocument(documentId);
    this.activeDocumentId = documentId;
    return document;
  }

  getBlockService(documentId: string): BlockOperationService {
    if (this.blockOperationServices.has(documentId)) {
      return this.blockOperationServices.get(documentId)!;
    }

    const service = BlockOperationService.getInstance(documentId, this.database);
    this.blockOperationServices.set(documentId, service);
    return service;
  }

  private loadDocumentsFromDatabase(): void {
    try {
      const rows = this.database
        .prepare(
          `SELECT id, title, created_at, updated_at, block_count, profile_id, parent_document_id, position, is_expanded, deleted_at FROM documents`
        )
        .all();

      this.documents.clear();
      for (const row of rows) {
        this.documents.set(row.id, this.mapDocumentRow(row));
      }

      if (!this.activeDocumentId && this.documents.size > 0) {
        const first = this.documents.values().next().value;
        this.activeDocumentId = first?.id ?? null;
      }
    } catch (error) {
      log.debug(`Failed to load documents: ${error}`, "DocumentManager");
      throw error;
    }
  }

  private mapDocumentRow(row: any): DocumentRecord {
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      blockCount: row.block_count ?? 0,
      profileId: row.profile_id ?? DEFAULT_PROFILE_ID,
      parentDocumentId: row.parent_document_id ?? null,
      position: row.position ?? 0,
      isExpanded: row.is_expanded === 0 ? false : true,
      deletedAt: row.deleted_at ?? null,
    };
  }

  private getNextSiblingPosition(
    profileId: string,
    parentId: string | null
  ): number {
    const siblings = this.listDocuments(profileId).filter(
      (doc) => doc.parentDocumentId === parentId
    );
    if (siblings.length === 0) {
      return 0;
    }
    return Math.max(...siblings.map((doc) => doc.position)) + 1;
  }

  private ensureDefaultDocument(): void {
    if (this.documents.size > 0) {
      return;
    }

    log.debug("No documents found - creating default document", "DocumentManager");
    this.createDocument(DEFAULT_PROFILE_ID, "Untitled Document");
    this.ensureActiveDocument();
  }

  private ensureActiveDocument(): void {
    if (this.activeDocumentId) {
      return;
    }

    const [firstDocument] = this.listDocuments();
    this.activeDocumentId = firstDocument ? firstDocument.id : null;
  }
}
