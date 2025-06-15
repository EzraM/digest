declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
declare const APP_OVERLAY_VITE_DEV_SERVER_URL: string | undefined;
declare const APP_OVERLAY_VITE_NAME: string;
declare const PROMPT_OVERLAY_VITE_DEV_SERVER_URL: string | undefined;
declare const PROMPT_OVERLAY_VITE_NAME: string;

export const viteConfig = {
  mainWindow: {
    devServerUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
    name: MAIN_WINDOW_VITE_NAME,
  },
  appOverlay: {
    devServerUrl: APP_OVERLAY_VITE_DEV_SERVER_URL,
    name: APP_OVERLAY_VITE_NAME,
  },
  promptOverlay: {
    devServerUrl: PROMPT_OVERLAY_VITE_DEV_SERVER_URL,
    name: PROMPT_OVERLAY_VITE_NAME,
  },
};
