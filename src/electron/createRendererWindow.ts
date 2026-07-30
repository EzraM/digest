import { BrowserWindow, WebContentsView } from "electron";
import path from "path";
import { shouldOpenDevTools } from "../config/development";
import { viteConfig } from "../config/vite";

interface CreateRendererWindowOptions {
  initialHash?: string;
}

export interface RendererWindow {
  browserWindow: BrowserWindow;
  rendererView: WebContentsView;
  updateBounds(): void;
}

export const createRendererWindow = ({
  initialHash,
}: CreateRendererWindowOptions): RendererWindow => {
  const browserWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const }
      : {}),
  });

  const rendererView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: "persist:main-app",
    },
  });

  const updateBounds = () => {
    const { width, height } = browserWindow.getContentBounds();
    rendererView.setBounds({ x: 0, y: 0, width, height });
  };
  updateBounds();

  rendererView.webContents.session.webRequest.onHeadersReceived(
    (
      details: { responseHeaders?: Record<string, string[]> },
      callback: (response: {
        responseHeaders: Record<string, string[]>;
      }) => void
    ) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "connect-src 'self' https://example.com; " +
              "img-src 'self' data: https: digest-image: blob:; " +
              "font-src 'self' data:;",
          ],
        },
      });
    }
  );

  browserWindow.contentView.addChildView(rendererView);

  if (viteConfig.mainWindow.devServerUrl) {
    void rendererView.webContents.loadURL(
      `${viteConfig.mainWindow.devServerUrl}${initialHash ?? ""}`
    );
  } else {
    void rendererView.webContents.loadFile(
      path.join(
        __dirname,
        `../renderer/${viteConfig.mainWindow.name}/index.html`
      ),
      initialHash ? { hash: initialHash.replace(/^#/, "") } : undefined
    );
  }

  if (shouldOpenDevTools("openMainWindow")) {
    const devTools = new BrowserWindow();
    rendererView.webContents.setDevToolsWebContents(devTools.webContents);
    rendererView.webContents.openDevTools({ mode: "detach" });
  }

  return { browserWindow, rendererView, updateBounds };
};
