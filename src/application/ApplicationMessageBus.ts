import { randomUUID } from "node:crypto";

export type ProducerContext = {
  kind: "window" | "browser-view" | "internal" | "plugin";
  id: string;
  windowId?: string;
  rendererId?: number;
  pluginId?: string;
};

export type MessageKind = "command" | "query" | "event";

export type ApplicationMessage<T = unknown> = {
  messageId: string;
  kind: MessageKind;
  type: string;
  payload: T;
  producer: ProducerContext;
  context: {
    documentId?: string;
    placementId?: string;
    correlationId?: string;
    causationId?: string;
  };
  receivedAt: number;
};

export type MessageOutcome =
  | { status: "succeeded"; durationMs: number }
  | { status: "rejected" | "failed"; durationMs: number; error: string };

export type MessageDiagnostic = {
  messageId: string;
  kind: MessageKind;
  type: string;
  producer: ProducerContext;
  context: ApplicationMessage["context"];
  receivedAt: number;
  outcome: MessageOutcome;
};

type Handler<T = unknown, R = unknown> = (
  message: ApplicationMessage<T>
) => R | Promise<R>;

/**
 * Typed application boundary shared by Electron IPC and future producers.
 * Diagnostics intentionally retain metadata only, never message payloads.
 */
export class ApplicationMessageBus {
  private readonly handlers = new Map<string, Handler>();
  private readonly diagnostics: MessageDiagnostic[] = [];

  constructor(
    private readonly historyLimit = 200,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID
  ) {}

  register<T, R>(
    kind: MessageKind,
    type: string,
    handler: Handler<T, R>
  ): void {
    const key = this.key(kind, type);
    if (this.handlers.has(key)) {
      throw new Error(`Application message handler already registered: ${key}`);
    }
    this.handlers.set(key, handler as Handler);
  }

  async dispatch<T, R>(input: {
    kind: MessageKind;
    type: string;
    payload: T;
    producer: ProducerContext;
    context?: ApplicationMessage["context"];
  }): Promise<R> {
    const receivedAt = this.now();
    const message: ApplicationMessage<T> = {
      messageId: this.createId(),
      kind: input.kind,
      type: input.type,
      payload: input.payload,
      producer: Object.freeze({ ...input.producer }),
      context: Object.freeze({ ...input.context }),
      receivedAt,
    };
    const handler = this.handlers.get(this.key(input.kind, input.type));
    if (!handler) {
      const error = `No application message handler for ${input.kind}:${input.type}`;
      this.record(message, { status: "rejected", durationMs: 0, error });
      throw new Error(error);
    }

    try {
      const result = await handler(message);
      this.record(message, {
        status: "succeeded",
        durationMs: this.now() - receivedAt,
      });
      return result as R;
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      this.record(message, {
        status: "failed",
        durationMs: this.now() - receivedAt,
        error,
      });
      throw cause;
    }
  }

  getDiagnostics(): readonly MessageDiagnostic[] {
    return this.diagnostics;
  }

  private record(
    message: ApplicationMessage,
    outcome: MessageOutcome
  ): void {
    this.diagnostics.push({
      messageId: message.messageId,
      kind: message.kind,
      type: message.type,
      producer: message.producer,
      context: message.context,
      receivedAt: message.receivedAt,
      outcome,
    });
    if (this.diagnostics.length > this.historyLimit) {
      this.diagnostics.splice(0, this.diagnostics.length - this.historyLimit);
    }
  }

  private key(kind: MessageKind, type: string): string {
    return `${kind}:${type}`;
  }
}
