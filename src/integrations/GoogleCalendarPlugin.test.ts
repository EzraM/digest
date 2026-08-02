import { ScheduledJob } from "../scheduler/ScheduledJobStore";
import { StoredIntegrationAccount } from "./IntegrationAccountStore";
import { GoogleAuthorization } from "./google/GoogleAuthorizationService";
import { GoogleCalendarPlugin } from "./google-calendar/GoogleCalendarPlugin";
import {
  InstalledAppGoogleOAuthAuthorizer,
} from "./google/GoogleOAuthAuthorizer";

const account: StoredIntegrationAccount = {
  id: "google:scheduled-user",
  integrationId: "google",
  providerAccountId: "scheduled-user",
  displayName: "Scheduled User",
  email: "scheduled@example.test",
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  credentialKey: "google:scheduled-user:refresh-token",
};

describe("GoogleCalendarPlugin", () => {
  it("schedules and repeats account sync through its scoped authorization", async () => {
    let connected: StoredIntegrationAccount[] = [];
    const authorization: GoogleAuthorization = {
      accounts: () => connected,
      connect: async () => {
        connected = [account];
        return account;
      },
      accessToken: async () => "calendar-token",
      disconnect: async () => {
        connected = [];
      },
    };
    const scheduled: Array<Omit<ScheduledJob<unknown>, "attempts">> = [];
    const removed: string[] = [];
    const synced: string[] = [];
    const scheduler = {
      schedule: <State>(job: Omit<ScheduledJob<State>, "attempts">) =>
        scheduled.push(job as Omit<ScheduledJob<unknown>, "attempts">),
      removeOwner: (ownerId: string) => removed.push(ownerId),
    };
    const plugin = new GoogleCalendarPlugin(
      authorization,
      scheduler,
      { sync: async (accountId) => void synced.push(accountId) },
      undefined,
      () => 1_000
    );

    const connectedAccount = await plugin.connect();
    expect(connectedAccount.integrationId).toBe("google-calendar");
    expect(scheduled[0]).toMatchObject({
      ownerId: account.id,
      kind: "google-calendar.sync",
      runAt: 1_000,
    });
    const result = await plugin.jobHandlers[0].run({
      ...scheduled[0],
      state: { accountId: account.id },
      attempts: 0,
    });
    expect(synced).toEqual([account.id]);
    expect(result).toMatchObject({ runAt: 901_000 });
    await plugin.disconnect(account.id);
    expect(removed).toEqual([account.id]);
    expect(plugin.listAccounts()).toEqual([]);
  });
});

describe("InstalledAppGoogleOAuthAuthorizer", () => {
  it("uses a loopback PKCE flow for caller-provided scopes", async () => {
    let authorizationUrl: URL | undefined;
    const calendarScope = "https://www.googleapis.com/auth/calendar.readonly";
    const authorizer = new InstalledAppGoogleOAuthAuthorizer(
      "desktop-client-id",
      async (url) => {
        authorizationUrl = new URL(url);
        const redirectUri = authorizationUrl.searchParams.get("redirect_uri");
        const state = authorizationUrl.searchParams.get("state");
        if (!redirectUri || !state) throw new Error("Missing OAuth callback data");
        await fetch(`${redirectUri}?code=authorization-code&state=${state}`);
      },
      async (input, init) => {
        if (String(input).endsWith("/token")) {
          const body = init?.body as URLSearchParams;
          expect(body.get("code_verifier")?.length ?? 0).toBe(64);
          return new Response(
            JSON.stringify({
              access_token: "access",
              refresh_token: "refresh",
              scope: `openid email ${calendarScope}`,
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            sub: "google-user",
            email: "person@example.test",
            name: "Person",
          }),
          { status: 200 }
        );
      }
    );

    const grant = await authorizer.authorize(["openid", "email", calendarScope]);
    expect(authorizationUrl?.searchParams.get("scope")).toContain(calendarScope);
    expect(grant).toMatchObject({
      providerAccountId: "google-user",
      refreshToken: "refresh",
    });
  });
});
