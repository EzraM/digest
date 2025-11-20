export interface ProfileRecord {
  id: string;
  name: string;
  partitionName: string;
  icon?: string | null;
  color?: string | null;
  createdAt: number;
  updatedAt: number;
  settings?: Record<string, unknown> | null;
}

export interface DocumentRecord {
  id: string;
  title: string | null;
  profileId: string;
  parentDocumentId: string | null;
  position: number;
  isExpanded: boolean;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
  blockCount: number;
}

export interface DocumentTreeNode {
  document: DocumentRecord;
  children: DocumentTreeNode[];
}
