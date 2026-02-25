declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

export const viteConfig = {
  mainWindow: {
    devServerUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
    name: MAIN_WINDOW_VITE_NAME,
  },
};
