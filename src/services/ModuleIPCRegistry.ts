import { Disposable } from "./ContributionRegistry";
import { RequestShape, Shape } from "./ModuleProtocol";

export interface ModuleIPCContext {
  rendererId: number;
}

export interface ModuleEventEnvelope {
  source: { moduleId: string };
  name: string;
  payload: unknown;
}

export interface ScopedModuleIPC {
  handle<Input, Output>(
    method: string,
    request: RequestShape<Input, Output>,
    handler: (
      input: Input,
      context: ModuleIPCContext
    ) => Output | Promise<Output>
  ): Disposable;
  publish<Payload>(event: string, eventShape: Shape<Payload>, payload: Payload): boolean;
}

interface RegisteredHandler {
  request: RequestShape<unknown, unknown>;
  invoke(input: unknown, context: ModuleIPCContext): unknown | Promise<unknown>;
}

export class ModuleIPCRegistry {
  private readonly handlers = new Map<string, RegisteredHandler>();
  private publisher: ((event: ModuleEventEnvelope) => boolean) | null = null;

  forModule(moduleId: string): ScopedModuleIPC {
    if (!moduleId) throw new Error("Module IPC requires a module ID");
    return {
      handle: (method, request, handler) =>
        this.handle(moduleId, method, request, handler),
      publish: (event, eventShape, payload) => {
        const parsed = eventShape.parse(payload);
        return this.publisher?.({
          source: { moduleId },
          name: event,
          payload: parsed,
        }) ?? false;
      },
    };
  }

  setPublisher(publisher: (event: ModuleEventEnvelope) => boolean): () => void {
    this.publisher = publisher;
    return () => {
      if (this.publisher === publisher) this.publisher = null;
    };
  }

  async invoke(
    moduleId: string,
    method: string,
    input: unknown,
    context: ModuleIPCContext
  ): Promise<unknown> {
    const handler = this.handlers.get(this.key(moduleId, method));
    if (!handler) throw new Error(`Unknown module operation: ${moduleId}/${method}`);
    const parsedInput = handler.request.input.parse(input);
    const output = await handler.invoke(parsedInput, context);
    return handler.request.output.parse(output);
  }

  clear(): void {
    this.handlers.clear();
    this.publisher = null;
  }

  private handle<Input, Output>(
    moduleId: string,
    method: string,
    request: RequestShape<Input, Output>,
    handler: (
      input: Input,
      context: ModuleIPCContext
    ) => Output | Promise<Output>
  ): Disposable {
    const key = this.key(moduleId, method);
    if (this.handlers.has(key)) {
      throw new Error(`Module operation already registered: ${moduleId}/${method}`);
    }
    this.handlers.set(key, {
      request: request as RequestShape<unknown, unknown>,
      invoke: (input, context) => handler(input as Input, context),
    });
    return {
      dispose: () => this.handlers.delete(key),
    };
  }

  private key(moduleId: string, method: string): string {
    return `${moduleId}\0${method}`;
  }
}
