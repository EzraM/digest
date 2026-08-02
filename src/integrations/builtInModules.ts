import { ProcessModuleDefinition } from "../services/ProcessModule";
import { schedulerProbeModule } from "./development/SchedulerProbeModule";
import { googleCalendarModule } from "./google-calendar/GoogleCalendarModule";
import { googleAuthorizationModule } from "./google/GoogleAuthorizationModule";

const productionModules: readonly ProcessModuleDefinition[] = [
  googleAuthorizationModule,
  googleCalendarModule,
];

export const builtInModules = (
  development: boolean
): readonly ProcessModuleDefinition[] =>
  development ? [...productionModules, schedulerProbeModule] : productionModules;
