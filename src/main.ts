import { app, BrowserWindow, BaseWindow, WebContentsView } from "electron";
import path from "path";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

const createWindow = () => {
  // // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  //const win = new BaseWindow({ width: 1400, height: 900 });

  const win = new BrowserWindow({ width: 1400, height: 900 });
  // const notes = new WebContentsView();
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log(`Using Vite dev server `, MAIN_WINDOW_VITE_DEV_SERVER_URL);
    win.webContents.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.webContents.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  const leftView = new WebContentsView();
  leftView.webContents.loadURL("https://electronjs.org");
  win.contentView.addChildView(leftView);
  leftView.setBounds({ x: 20, y: 200, width: 1200, height: 400 });

  const rightView = new WebContentsView();
  rightView.webContents.loadURL("https://github.com/electron/electron");
  win.contentView.addChildView(rightView);
  rightView.setBounds({ x: 20, y: 620, width: 1200, height: 600 });

  //notes.setBounds({ x: 0, y: 0, width: 1400, height: 900 });

  const devTools = new BrowserWindow();
  win.webContents.setDevToolsWebContents(devTools.webContents);
  win.webContents.openDevTools({ mode: "detach" });
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
