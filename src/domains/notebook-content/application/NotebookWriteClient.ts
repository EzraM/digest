import type { CustomPartialBlock } from "../../../types/schema";
import type {
  InsertNotebookContent,
  NotebookAddress,
  NotebookWriteOrigin,
  NotebookWriteResult,
} from "../core/NotebookAddress";

export class NotebookWriteClient {
  async insert(
    address: NotebookAddress,
    blocks: readonly CustomPartialBlock[],
    origin: NotebookWriteOrigin,
    requestId: string = crypto.randomUUID()
  ): Promise<NotebookWriteResult> {
    const command: InsertNotebookContent = {
      address,
      blocks: blocks as readonly Record<string, unknown>[],
      origin,
      requestId,
    };
    return window.electronAPI.notebook.insertContent(command);
  }
}
