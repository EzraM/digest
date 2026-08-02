import {
  EventPayload,
  ModuleProtocolDefinition,
  RequestShape,
  RequestInput,
  RequestOutput,
  Shape,
} from "./ModuleProtocol";

type AnyProtocol = ModuleProtocolDefinition<
  Record<string, RequestShape<unknown, unknown>>,
  Record<string, Shape<unknown>>
>;

export class RendererModuleClient<Protocol extends AnyProtocol> {
  constructor(
    private readonly moduleId: string,
    private readonly protocol: Protocol
  ) {}

  async invoke<Name extends keyof Protocol["requests"] & string>(
    name: Name,
    input: RequestInput<Protocol["requests"][Name]>
  ): Promise<RequestOutput<Protocol["requests"][Name]>> {
    const request = this.protocol.requests[name];
    const parsedInput = request.input.parse(input);
    const output = await window.electronAPI.modules.invoke(
      this.moduleId,
      name,
      parsedInput
    );
    return request.output.parse(output) as RequestOutput<
      Protocol["requests"][Name]
    >;
  }

  on<Name extends keyof Protocol["events"] & string>(
    name: Name,
    listener: (payload: EventPayload<Protocol["events"][Name]>) => void
  ): () => void {
    return window.electronAPI.modules.onEvent((event) => {
      if (event.source.moduleId !== this.moduleId || event.name !== name) return;
      listener(
        this.protocol.events[name].parse(event.payload) as EventPayload<
          Protocol["events"][Name]
        >
      );
    });
  }
}
