import { ComponentType } from "react";
import { ProfileRecord, ProfileSettings } from "../types/documents";

export interface ProfileSettingsPanelProps {
  profile: ProfileRecord;
  updateSettings: (settings: ProfileSettings) => Promise<void>;
}

export interface RendererSettingsContribution {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly Panel: ComponentType<ProfileSettingsPanelProps>;
}

export interface RendererModule {
  readonly id: string;
  readonly Root: ComponentType;
  readonly settings?: readonly RendererSettingsContribution[];
}
