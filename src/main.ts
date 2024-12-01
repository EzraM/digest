import { app, BrowserWindow, WebContentsView, ipcMain } from "electron";
import path from "path";
import { ViewManager } from "./services/ViewManager";
import { viteConfig } from "./config/vite";
import { AppOverlay } from "./services/AppOverlay";
import { log } from "./utils/mainLogger";

if (require("electron-squirrel-startup")) {
  app.quit();
}

const EVENTS = {
  BLOCK_MENU: {
    OPEN: "block-menu:open",
    CLOSE: "block-menu:close",
    SELECT: "block-menu:select",
  },
} as const;

const createWindow = () => {
  const baseWindow = new BrowserWindow({
    width: 1400,
    height: 900,
  });

  const appView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, `preload.js`),
      nodeIntegration: true,
    },
  });
  appView.setBounds({ x: 0, y: 0, height: 900, width: 1400 });

  baseWindow.contentView.addChildView(appView);

  if (viteConfig.mainWindow.devServerUrl) {
    appView.webContents.loadURL(viteConfig.mainWindow.devServerUrl);
  } else {
    appView.webContents.loadFile(
      path.join(
        __dirname,
        `../renderer/${viteConfig.mainWindow.name}/index.html`
      )
    );
  }

  const devTools = new BrowserWindow();
  appView.webContents.setDevToolsWebContents(devTools.webContents);
  appView.webContents.openDevTools({ mode: "detach" });

  const viewManager = new ViewManager(baseWindow);
  const appOverlay = new AppOverlay({}, baseWindow);

  ipcMain.on("set-layout", (_, layout) =>
    viewManager.handleLayoutUpdate(layout)
  );
  ipcMain.on("update-browser-url", (_, url) =>
    viewManager.handleUrlUpdate(url)
  );

  ipcMain.on(EVENTS.BLOCK_MENU.OPEN, () => {
    log.debug("Opening block menu", "main");
    appOverlay.show();
  });

  ipcMain.on(EVENTS.BLOCK_MENU.CLOSE, () => {
    log.debug("Closing block menu", "main");
    appOverlay.hide();
  });

  ipcMain.on(EVENTS.BLOCK_MENU.SELECT, (_, blockKey) => {
    log.debug(`Block selected: ${blockKey}`, "main");
    appView.webContents.send(EVENTS.BLOCK_MENU.SELECT, blockKey);
    appOverlay.hide();
  });
};

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
