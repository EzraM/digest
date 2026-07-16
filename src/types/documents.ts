export interface JiraLinksPluginSettings {
  enabled: boolean;
  baseUrl: string;
  projectKeys?: string[];
}

export interface ProfileSettings {
  plugins?: {
    "builtin.jira-links"?: JiraLinksPluginSettings;
  };
}

export interface ProfileRecord {
  id: string;
  name: string;
  partitionName: string;
  icon?: string | null;
  color?: string | null;
  createdAt: number;
  updatedAt: number;
  settings?: ProfileSettings | null;
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
