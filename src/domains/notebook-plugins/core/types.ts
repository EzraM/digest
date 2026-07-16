export type PortableInlineContent =
  | {
      type: "text";
      text: string;
      styles?: Record<string, unknown>;
    }
  | {
      type: "link";
      href: string;
      content: PortableInlineContent[];
    };

export interface NotebookBlockSnapshot {
  id: string;
  type: string;
  content: PortableInlineContent[] | null;
}

export interface NotebookTransactionEvent {
  profileId: string;
  documentId: string | null;
  transactionId: string;
  source: "user" | "plugin" | "system";
  blocks: readonly NotebookBlockSnapshot[];
}

export type NotebookPluginOperation = {
  type: "set-inline-content";
  blockId: string;
  content: PortableInlineContent[];
};

export interface NotebookPluginContext<TSettings = unknown> {
  profileId: string;
  settings: TSettings;
}

export interface NotebookPluginInstance {
  onTransaction(
    event: NotebookTransactionEvent
  ): NotebookPluginOperation[] | Promise<NotebookPluginOperation[]>;
  dispose?(): void;
}

export interface NotebookPlugin<TSettings = unknown> {
  manifest: {
    id: string;
    name: string;
    version: string;
  };
  activate(context: NotebookPluginContext<TSettings>): NotebookPluginInstance;
}

export interface EnabledNotebookPlugin {
  plugin: NotebookPlugin<any>;
  settings: unknown;
}
