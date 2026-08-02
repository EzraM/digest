import { Scheduler } from "../../scheduler/Scheduler";
import { CONTRIBUTION_POINTS } from "../../services/contributionPoints";
import { ProcessModuleDefinition } from "../../services/ProcessModule";
import { SERVICE_IDS } from "../../services/serviceIds";
import { log } from "../../utils/mainLogger";
import { SchedulerProbePlugin } from "./SchedulerProbePlugin";

const SCHEDULER_PROBE_SERVICE = "development.scheduler-probe";

export const schedulerProbeModule = {
  id: "scheduler-probe",
  provides: [
    {
      name: SCHEDULER_PROBE_SERVICE,
      dependencies: [{ name: SERVICE_IDS.SCHEDULER, version: "^1.0.0" }],
      create: (dependencies) =>
        new SchedulerProbePlugin(
          dependencies.get<Scheduler>(SERVICE_IDS.SCHEDULER),
          (message) => log.debug(`Probe fired: ${message}`, "Scheduler")
        ),
    },
  ],
  activates: [{ name: SCHEDULER_PROBE_SERVICE }],
  contributes: [
    {
      point: CONTRIBUTION_POINTS.INTEGRATION,
      id: "scheduler-probe",
      dependencies: [{ name: SCHEDULER_PROBE_SERVICE }],
      create: (dependencies) =>
        dependencies.get<SchedulerProbePlugin>(SCHEDULER_PROBE_SERVICE),
    },
  ],
} satisfies ProcessModuleDefinition;
