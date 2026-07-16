import {
  NotebookPluginOperation,
  NotebookTransactionEvent,
} from "./types";

export const validatePluginOperations = (
  event: NotebookTransactionEvent,
  operations: NotebookPluginOperation[]
): NotebookPluginOperation[] => {
  const blockIds = new Set(event.blocks.map((block) => block.id));

  return operations.filter((operation) => {
    if (operation.type !== "set-inline-content") return false;
    if (!blockIds.has(operation.blockId)) return false;
    if (!Array.isArray(operation.content)) return false;
    return JSON.stringify(operation.content).length <= 100_000;
  });
};
