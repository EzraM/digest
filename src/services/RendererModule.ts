import { ComponentType } from "react";

export interface RendererModule {
  readonly id: string;
  readonly Root: ComponentType;
}
