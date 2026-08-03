import { RendererModule } from "../services/RendererModule";
import { googleCalendarRendererModule } from "./google-calendar/GoogleCalendarRendererModule";
import { jiraLinksRendererModule } from "../domains/notebook-plugins/builtins/jira-links/JiraLinksRendererModule";

export const createBuiltInRendererModules = (): RendererModule[] => [
  googleCalendarRendererModule,
  jiraLinksRendererModule,
];
