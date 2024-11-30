import { app, BrowserWindow, WebContentsView, ipcMain } from "electron";
import path from "path";
import { Subject, tap } from "rxjs";
import set from "lodash/set";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

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

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log(`Using Vite dev server `, MAIN_WINDOW_VITE_DEV_SERVER_URL);
    appView.webContents.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    appView.webContents.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  console.log("Second window? ", APP_OVERLAY_VITE_DEV_SERVER_URL);

  const devTools = new BrowserWindow();
  appView.webContents.setDevToolsWebContents(devTools.webContents);
  appView.webContents.openDevTools({ mode: "detach" });

  const events$ = new Subject();
  const views = {};

  // each block has a WebContentsView
  // when layout is updated, resize the view bounds
  // when url is updated, call loadUrl
  events$
    .pipe(
      // first, check if the webcontentsview exists, and make one if we need one
      tap((ev) => {
        const { blockId } = ev;

        // put the data in first
        if (ev.type == "set-url") {
          set(views, [blockId, "url"], ev.url);
        }
        if (ev.type === "set-layout") {
          set(views, [blockId, "bounds"], ev.bounds);
        }

        // create view, if we don't have one
        if (
          views[blockId].url &&
          views[blockId].bounds &&
          !views[blockId].contents
        ) {
          console.log(`Create view for ${blockId}, ${ev.type}`);
          const newView = new WebContentsView();
          console.log(`New view: `, newView);
          newView.webContents.loadURL(views[blockId].url);
          newView.setBounds(views[blockId].bounds);

          baseWindow.contentView.addChildView(newView);

          views[blockId].contents = newView;
        }

        // update bounds
        if (views[blockId].contents && ev.type === "set-layout") {
          views[blockId].contents.setBounds(views[blockId].bounds);
        }
      })
    )
    .subscribe();

  ipcMain.on("set-layout", (e, layout) => {
    // console.log(`update layout`, layout);
    events$.next({ ...layout, type: "set-layout" });
  });

  ipcMain.on("update-browser-url", (e, url) => {
    events$.next({ ...url, type: "set-url" });
  });

  const blockViews = {};
  const addBlockEvents$ = new Subject();
  addBlockEvents$
    .pipe(
      tap((e) => {
        if (e.type === "open") {
          console.log(`[add block event listener]`);
          openAppOverlay(blockViews, baseWindow);
        }
      })
    )
    .subscribe();

  ipcMain.on("add-block-event", (e, event) => {
    console.log(`add-block-event called!`, event);
    addBlockEvents$.next(event);
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
function openAppOverlay(state, baseWindow: BrowserWindow) {
  console.log(`[openAppOverlay]`);
  if (!state.overlay) {
    const appOverlay = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, `app-overlay.preload.js`),
        nodeIntegration: true,
      },
    });

    // x: assuming 1400 width,
    appOverlay.setBounds({ x: 1000, y: 200, height: 600, width: 400 });

    if (APP_OVERLAY_VITE_DEV_SERVER_URL) {
      console.log(
        `Using Vite dev server for second window`,
        APP_OVERLAY_VITE_DEV_SERVER_URL
      );
      appOverlay.webContents.loadURL(APP_OVERLAY_VITE_DEV_SERVER_URL);
    } else {
      appOverlay.webContents.loadFile(
        path.join(
          __dirname,
          `../renderer/${APP_OVERLAY_VITE_NAME}/app-overlay.html`
        )
      );
    }
    state.overlay = appOverlay;

    const devTools = new BrowserWindow();
    appOverlay.webContents.setDevToolsWebContents(devTools.webContents);
    appOverlay.webContents.openDevTools({ mode: "detach" });
  }

  baseWindow.contentView.addChildView(state.overlay);
}
