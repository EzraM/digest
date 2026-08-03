import { app, BrowserWindow, globalShortcut } from "electron";
import {
  dispose,
  openWindow,
  openWindowFrom,
} from "./application/DigestApplication";
import { DatabaseManager } from "./database/DatabaseManager";
import { configureElectron } from "./electron/configureElectron";
import { configureApplicationMenu } from "./electron/configureApplicationMenu";
import { log } from "./utils/mainLogger";

if (require("electron-squirrel-startup")) {
  app.quit();
}

configureElectron();

app.on("ready", async () => {
  log.debug("App ready, creating window and setting up services", "main");
  try {
    configureApplicationMenu(() =>
      openWindowFrom(BrowserWindow.getFocusedWindow())
    );
    await openWindow();
  } catch (error) {
    log.debug(`Failed to create window: ${error}`, "main");
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    try {
      await openWindow();
    } catch (error) {
      log.debug(`Failed to create window on activate: ${error}`, "main");
    }
  }
});

let shutdownStarted = false;
let shutdownComplete = false;
app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  void (async () => {
    globalShortcut.unregisterAll();
    try {
      await dispose();
    } catch (error) {
      log.debug(`Service cleanup error: ${error}`, "main");
    }
    try {
      const dbManager = DatabaseManager.getInstance();
      if (dbManager.initialized) {
        dbManager.close();
        log.debug("Database connection closed", "main");
      }
    } catch (error) {
      log.debug(`Database cleanup error: ${error}`, "main");
    } finally {
      shutdownComplete = true;
      app.quit();
    }
  })();
});
