import { RendererModule } from "../services/RendererModule";
import { googleCalendarRendererModule } from "./google-calendar/GoogleCalendarRendererModule";

export const createBuiltInRendererModules = (): RendererModule[] => [
  googleCalendarRendererModule,
];
