import { IPCRouter } from "../ipc/IPCRouter";
import { Container } from "./Container";

type BridgeMethod = string | { method: string; alias?: string };

export class IPCServiceBridge {
  constructor(private router: IPCRouter, private container: Container) {}

  exposeService(
    serviceName: string,
    methods: BridgeMethod[],
    namespace?: string
  ): void {
    const service = this.container.get<any>(serviceName);
    const channelPrefix = namespace || serviceName;

    methods.forEach((methodDefinition) => {
      const methodName =
        typeof methodDefinition === "string"
          ? methodDefinition
          : methodDefinition.method;
      const alias =
        typeof methodDefinition === "string"
          ? methodName
          : methodDefinition.alias ?? methodName;

      const channel = `${channelPrefix}:${alias}`;
      if (typeof service[methodName] !== "function") {
        throw new Error(
          `Cannot expose ${serviceName}.${methodName} - not a callable method`
        );
      }

      this.router.register(channel, {
        type: "invoke",
        fn: async (_event, ...args: any[]) => service[methodName](...args),
      });
    });
  }
}
