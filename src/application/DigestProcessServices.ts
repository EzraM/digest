import type Database from "better-sqlite3";
import { shell } from "electron";
import { ScheduledJobStore } from "../scheduler/ScheduledJobStore";
import { Scheduler } from "../scheduler/Scheduler";
import { ServiceCatalog } from "../services/Container";
import { SERVICE_IDS } from "../services/serviceIds";

/** Electron-process capabilities made available to built-in modules. */
export const digestProcessServices = {
  provides: [
    {
      name: SERVICE_IDS.SCHEDULER,
      version: "1.0.0",
      dependencies: [{ name: SERVICE_IDS.DATABASE, version: "^1.0.0" }],
      create: (dependencies) =>
        new Scheduler(
          new ScheduledJobStore(
            dependencies.get<Database.Database>(SERVICE_IDS.DATABASE)
          )
        ),
    },
    {
      name: SERVICE_IDS.OPEN_EXTERNAL,
      version: "1.0.0",
      create: () => (url: string) => shell.openExternal(url),
    },
  ],
  activates: [{ name: SERVICE_IDS.SCHEDULER, version: "^1.0.0" }],
} satisfies ServiceCatalog;
