import { WebContentsView } from "electron";
import { log } from "../utils/mainLogger";

const EVENTS = {
  BROWSER: {
    NEW_BLOCK: "browser:new-block",
  },
} as const;

export class LinkInterceptionService {
  private onLinkClickCallback?: (url: string) => void;

  constructor(private appView: WebContentsView) {
    this.setupLinkInterception();
  }

  // Method to set the link click callback
  public setLinkClickCallback(callback: (url: string) => void) {
    this.onLinkClickCallback = callback;
  }

  private setupLinkInterception() {
    // Handle new window requests (e.g., link clicks with target="_blank")
    this.appView.webContents.setWindowOpenHandler(({ url }) => {
      log.debug(
        `New window request in main renderer, URL: ${url}`,
        "LinkInterceptionService"
      );
      this.handleLinkClick(url);
      return { action: "deny" }; // Prevent the default window open behavior
    });

    // Handle regular link navigation within the main renderer
    this.appView.webContents.on("will-navigate", (event, url) => {
      const currentUrl = this.appView.webContents.getURL();

      log.debug(
        `Navigation event in main renderer, from: ${currentUrl} to: ${url}`,
        "LinkInterceptionService"
      );

      // Only intercept external links (not internal navigation like hash changes)
      if (currentUrl && this.isExternalNavigation(currentUrl, url)) {
        log.debug(
          `External navigation intercepted in main renderer: ${url}`,
          "LinkInterceptionService"
        );
        event.preventDefault();
        this.handleLinkClick(url);
      } else {
        log.debug(
          `Allowing internal navigation in main renderer: ${url}`,
          "LinkInterceptionService"
        );
      }
    });
  }

  // Helper method to determine if navigation is to an external URL
  private isExternalNavigation(currentUrl: string, targetUrl: string): boolean {
    try {
      const current = new URL(currentUrl);
      const target = new URL(targetUrl);

      // Check if it's the same origin (hostname and port)
      if (current.origin !== target.origin) {
        return true;
      }

      // Same origin but different path (ignoring hash changes)
      const currentPathAndQuery = current.pathname + current.search;
      const targetPathAndQuery = target.pathname + target.search;

      return currentPathAndQuery !== targetPathAndQuery;
    } catch (e) {
      // If there's any error in parsing URLs, treat as external
      log.debug(`Error comparing URLs: ${e}`, "LinkInterceptionService");
      return true;
    }
  }

  // Handle link clicks by creating a new site block
  private handleLinkClick(url: string) {
    log.debug(`Handling link click to URL: ${url}`, "LinkInterceptionService");

    try {
      // Ensure the URL is valid before sending
      if (!this.isValidUrl(url)) {
        log.debug(
          `Invalid URL, cannot create site block: ${url}`,
          "LinkInterceptionService"
        );
        return;
      }

      log.debug(
        `Sending new site block event for URL: ${url}`,
        "LinkInterceptionService"
      );

      // Call the callback function to create a new site block
      if (this.onLinkClickCallback) {
        this.onLinkClickCallback(url);
        log.debug(
          `Successfully sent new site block event`,
          "LinkInterceptionService"
        );
      } else {
        log.debug(
          `No link click callback available, cannot create site block`,
          "LinkInterceptionService"
        );
      }
    } catch (error) {
      log.debug(
        `Error handling link click: ${error}`,
        "LinkInterceptionService"
      );
    }
  }

  // Helper method to validate URLs
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
