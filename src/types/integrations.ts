export interface IntegrationManifestView {
  id: string;
  name: string;
  summary: string;
  connectionDescription: string;
}

export interface ConnectedIntegrationAccountView {
  id: string;
  integrationId: string;
  providerAccountId: string;
  displayName: string;
  email?: string;
}

export interface IntegrationsView {
  integrations: IntegrationManifestView[];
  accounts: ConnectedIntegrationAccountView[];
}
