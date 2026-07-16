import { validatePluginOperations } from "../core/validatePluginOperations";
import {
  EnabledNotebookPlugin,
  NotebookPluginInstance,
  NotebookPluginOperation,
  NotebookTransactionEvent,
} from "../core/types";

/**
 * Runtime-neutral plugin coordinator. Its values are structured-cloneable so
 * this boundary can move to a Worker, sandboxed iframe, or utility process.
 */
export class PluginHost {
  private instances: NotebookPluginInstance[] = [];
  private applyingPluginOperations = false;
  private processingTransaction = false;

  configure(profileId: string, plugins: EnabledNotebookPlugin[]): void {
    this.dispose();
    this.instances = plugins.map(({ plugin, settings }) =>
      plugin.activate({ profileId, settings })
    );
  }

  async run(
    event: NotebookTransactionEvent,
    apply: (operations: NotebookPluginOperation[]) => void
  ): Promise<void> {
    if (
      event.source !== "user" ||
      this.applyingPluginOperations ||
      this.processingTransaction
    ) return;

    this.processingTransaction = true;
    try {
      const proposed = (
        await Promise.all(
          this.instances.map((instance) => instance.onTransaction(event))
        )
      ).flat();
      const valid = validatePluginOperations(event, proposed);
      if (valid.length === 0) return;

      this.applyingPluginOperations = true;
      try {
        apply(valid);
      } finally {
        this.applyingPluginOperations = false;
      }
    } finally {
      this.processingTransaction = false;
    }
  }

  dispose(): void {
    this.instances.forEach((instance) => instance.dispose?.());
    this.instances = [];
  }
}
