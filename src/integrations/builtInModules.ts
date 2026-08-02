import { ProcessModule } from "../services/ProcessModule";
import { SchedulerProbeModule } from "./development/SchedulerProbeModule";
import { GoogleCalendarModule } from "./google-calendar/GoogleCalendarModule";
import { GoogleAuthorizationModule } from "./google/GoogleAuthorizationModule";

export const createBuiltInModules = (
  openExternal: (url: string) => Promise<unknown>,
  development: boolean
): ProcessModule[] => {
  const modules: ProcessModule[] = [
    new GoogleAuthorizationModule(openExternal),
    new GoogleCalendarModule(openExternal),
  ];
  if (development) modules.push(new SchedulerProbeModule());
  return modules;
};
