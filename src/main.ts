import { app, BrowserWindow, WebContentsView, ipcMain } from "electron";
import path from "path";

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

  const topView = new WebContentsView();
  topView.webContents.loadURL("https://electronjs.org");
  win.contentView.addChildView(topView);
  topView.setBounds({ x: 20, y: 100, width: 1300, height: 400 });

  const bottomView = new WebContentsView();
  bottomView.webContents.loadURL("https://github.com/electron/electron");
  win.contentView.addChildView(bottomView);
  bottomView.setBounds({ x: 20, y: 900, width: 1300, height: 400 });

  const devTools = new BrowserWindow();
  win.webContents.setDevToolsWebContents(devTools.webContents);
  win.webContents.openDevTools({ mode: "detach" });

  let resetBounds = createResetBounds(topView, bottomView);

  ipcMain.on("set-scroll", (e, scrollY) => {
    resetBounds(scrollY);
  });
};

// gameLoop
function createResetBounds(
  topView: WebContentsView,
  bottomView: WebContentsView
) {
  return (scrollY) => {
    topView.setBounds({ x: 20, y: 200 - scrollY, width: 1200, height: 600 });
    bottomView.setBounds({ x: 20, y: 800 - scrollY, width: 1200, height: 800 });
  };
}

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
