import type Database from "better-sqlite3";
import { getEnvVar } from "../../config/environment";
import { SERVICE_IDS } from "../../services/serviceIds";
import {
  ProcessModule,
  ProcessModuleRegistrar,
} from "../../services/ProcessModule";
import { SqliteCredentialStore } from "../CredentialStore";
import { ElectronSecretEncryption } from "../ElectronSecretEncryption";
import { IntegrationAccountStore } from "../IntegrationAccountStore";
import { DefaultGoogleAuthorizationProvider } from "./GoogleAuthorizationService";
import { GoogleAuthorizationStore } from "./GoogleAuthorizationStore";
import { InstalledAppGoogleOAuthAuthorizer } from "./GoogleOAuthAuthorizer";

export const GOOGLE_AUTHORIZATION_SERVICE = {
  name: "google.authorization",
  version: "1.0.0",
} as const;

export class GoogleAuthorizationModule implements ProcessModule {
  readonly id = "google-authorization";

  constructor(
    private readonly openExternal: (url: string) => Promise<unknown>
  ) {}

  register(module: ProcessModuleRegistrar): void {
    module.provide(GOOGLE_AUTHORIZATION_SERVICE.name, {
      version: GOOGLE_AUTHORIZATION_SERVICE.version,
      dependencies: [{ name: SERVICE_IDS.DATABASE, version: "^1.0.0" }],
      factory: (dependencies) => {
        const database = dependencies.get<Database.Database>(
          SERVICE_IDS.DATABASE
        );
        const clientId = getEnvVar("GOOGLE_OAUTH_CLIENT_ID");
        return new DefaultGoogleAuthorizationProvider(
          clientId,
          new IntegrationAccountStore(database),
          new GoogleAuthorizationStore(database),
          new SqliteCredentialStore(database, new ElectronSecretEncryption()),
          new InstalledAppGoogleOAuthAuthorizer(clientId, this.openExternal)
        );
      },
    });
  }
}
