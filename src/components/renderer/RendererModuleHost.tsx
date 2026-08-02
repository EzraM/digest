import { createBuiltInRendererModules } from "../../integrations/builtInRendererModules";

const modules = createBuiltInRendererModules();

export const RendererModuleHost = () => (
  <>
    {modules.map(({ id, Root }) => (
      <Root key={id} />
    ))}
  </>
);
