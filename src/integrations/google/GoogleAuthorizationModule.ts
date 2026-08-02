import type Database from "better-sqlite3";
import { getEnvVar } from "../../config/environment";
import { ProcessModuleDefinition } from "../../services/ProcessModule";
import { SERVICE_IDS } from "../../services/serviceIds";
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

export const googleAuthorizationModule = {
  id: "google-authorization",
  provides: [
    {
      name: GOOGLE_AUTHORIZATION_SERVICE.name,
      definition: {
        version: GOOGLE_AUTHORIZATION_SERVICE.version,
        dependencies: [
          { name: SERVICE_IDS.DATABASE, version: "^1.0.0" },
          { name: SERVICE_IDS.OPEN_EXTERNAL, version: "^1.0.0" },
        ],
        factory: (dependencies) => {
          const database = dependencies.get<Database.Database>(
            SERVICE_IDS.DATABASE
          );
          const openExternal = dependencies.get<
            (url: string) => Promise<unknown>
          >(SERVICE_IDS.OPEN_EXTERNAL);
          const clientId = getEnvVar("GOOGLE_OAUTH_CLIENT_ID");
          return new DefaultGoogleAuthorizationProvider(
            clientId,
            new IntegrationAccountStore(database),
            new GoogleAuthorizationStore(database),
            new SqliteCredentialStore(database, new ElectronSecretEncryption()),
            new InstalledAppGoogleOAuthAuthorizer(clientId, openExternal)
          );
        },
      },
    },
  ],
} satisfies ProcessModuleDefinition;
