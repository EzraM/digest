import { app, protocol } from "electron";

export const configureElectron = () => {
  const remoteDebuggingPort = process.env.DIGEST_REMOTE_DEBUGGING_PORT;
  if (remoteDebuggingPort) {
    if (!/^\d+$/.test(remoteDebuggingPort)) {
      throw new Error("DIGEST_REMOTE_DEBUGGING_PORT must be a numeric port");
    }
    app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
    app.commandLine.appendSwitch("remote-debugging-port", remoteDebuggingPort);
  }

  protocol.registerSchemesAsPrivileged([
    {
      scheme: "digest-image",
      privileges: {
        bypassCSP: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
};
