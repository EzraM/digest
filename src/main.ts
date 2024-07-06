import { app, BrowserWindow, WebContentsView, ipcMain } from "electron";
import path from "path";
import { Subject, tap } from "rxjs";
import set from "lodash/set";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, `preload.js`),
      nodeIntegration: true,
    },
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log(`Using Vite dev server `, MAIN_WINDOW_VITE_DEV_SERVER_URL);
    win.webContents.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.webContents.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  const devTools = new BrowserWindow();
  win.webContents.setDevToolsWebContents(devTools.webContents);
  win.webContents.openDevTools({ mode: "detach" });

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

        // create view
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

          win.contentView.addChildView(newView);
          views[blockId].contents = newView;
        }

        // update bounds
        if (views[blockId].contents && ev.type === "set-layout") {
          views[blockId].contents.setBounds(views[blockId].bounds);
        }
      })
    )
    .subscribe();

  ipcMain.on("update-browser", (e, layout) => {
    console.log(`update layout`, layout);
    events$.next({ ...layout, type: "set-layout" });
  });

  ipcMain.on("update-browser-url", (e, url) => {
    events$.next({ ...url, type: "set-url" });
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
