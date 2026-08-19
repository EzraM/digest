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
import type { GoogleOAuthAuthorizer } from "./GoogleOAuthAuthorizer";

const createAuthorizer = (
  clientId: string,
  clientSecret: string,
  openExternal: (url: string) => Promise<unknown>
): GoogleOAuthAuthorizer => {
  if (process.env.DIGEST_E2E === "oauth") {
    return {
      authorize: async (scopes) => ({
        providerAccountId: "digest-e2e-user",
        displayName: "Digest E2E User",
        email: "digest-e2e@example.test",
        scopes: [...scopes],
        refreshToken: "digest-e2e-refresh-token",
      }),
      revoke: async () => undefined,
    };
  }
  return new InstalledAppGoogleOAuthAuthorizer(
    clientId,
    openExternal,
    fetch,
    clientSecret
  );
};

export const GOOGLE_AUTHORIZATION_SERVICE = {
  name: "google.authorization",
  version: "1.0.0",
} as const;

export const googleAuthorizationModule = {
  id: "google-authorization",
  provides: [
    {
      name: GOOGLE_AUTHORIZATION_SERVICE.name,
      version: GOOGLE_AUTHORIZATION_SERVICE.version,
      dependencies: [
        { name: SERVICE_IDS.DATABASE, version: "^1.0.0" },
        { name: SERVICE_IDS.OPEN_EXTERNAL, version: "^1.0.0" },
      ],
      create: (dependencies) => {
        const database = dependencies.get<Database.Database>(
          SERVICE_IDS.DATABASE
        );
        const openExternal = dependencies.get<
          (url: string) => Promise<unknown>
        >(SERVICE_IDS.OPEN_EXTERNAL);
        const clientId = getEnvVar("GOOGLE_OAUTH_CLIENT_ID");
        const clientSecret = getEnvVar("GOOGLE_OAUTH_CLIENT_SECRET");
        return new DefaultGoogleAuthorizationProvider(
          clientId,
          new IntegrationAccountStore(database),
          new GoogleAuthorizationStore(database),
          new SqliteCredentialStore(database, new ElectronSecretEncryption()),
          createAuthorizer(clientId, clientSecret, openExternal),
          fetch,
          () => Date.now(),
          clientSecret
        );
      },
    },
  ],
} satisfies ProcessModuleDefinition;
