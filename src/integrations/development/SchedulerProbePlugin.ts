import { IntegrationPlugin } from "../IntegrationPlugin";
import { JobHandler, Scheduler } from "../../scheduler/Scheduler";

export interface SchedulerProbeState {
  message: string;
}

export class SchedulerProbePlugin implements IntegrationPlugin {
  readonly manifest = {
    id: "scheduler-probe",
    name: "Scheduler Probe",
    summary: "Verifies development scheduler plumbing",
    connectionDescription: "No connection required",
  };

  readonly jobHandlers: JobHandler<SchedulerProbeState>[] = [
    {
      kind: "scheduler.probe",
      run: async (job) => {
        this.onProbe(job.state.message);
        return { complete: true as const };
      },
    },
  ];

  constructor(
    private readonly scheduler: Pick<Scheduler, "schedule">,
    private readonly onProbe: (message: string) => void,
    private readonly now: () => number = () => Date.now()
  ) {}

  start(): void {
    this.scheduler.schedule({
      id: "scheduler-probe:startup",
      ownerId: this.manifest.id,
      kind: "scheduler.probe",
      runAt: this.now() + 5_000,
      state: { message: "Digest scheduler is alive" },
    });
  }
}
