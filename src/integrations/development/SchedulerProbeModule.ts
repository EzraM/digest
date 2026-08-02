import { ProcessModule, ProcessModuleRegistrar } from "../../services/ProcessModule";
import { CONTRIBUTION_POINTS } from "../../services/contributionPoints";
import { SERVICE_IDS } from "../../services/serviceIds";
import { Scheduler } from "../../scheduler/Scheduler";
import { log } from "../../utils/mainLogger";
import { SchedulerProbePlugin } from "./SchedulerProbePlugin";

const SCHEDULER_PROBE_SERVICE = "development.scheduler-probe";

export class SchedulerProbeModule implements ProcessModule {
  readonly id = "scheduler-probe";

  register(module: ProcessModuleRegistrar): void {
    module.provide(SCHEDULER_PROBE_SERVICE, {
      dependencies: [{ name: SERVICE_IDS.SCHEDULER, version: "^1.0.0" }],
      factory: (dependencies) => {
        const scheduler = dependencies.get<Scheduler>(SERVICE_IDS.SCHEDULER);
        const plugin = new SchedulerProbePlugin(scheduler, (message) =>
          log.debug(`Probe fired: ${message}`, "Scheduler")
        );
        module.contribute(
          CONTRIBUTION_POINTS.INTEGRATION,
          plugin.manifest.id,
          plugin
        );
        return plugin;
      },
    });
    module.activate(SCHEDULER_PROBE_SERVICE);
  }
}
