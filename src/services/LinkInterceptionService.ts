import { WebContentsView } from "electron";
import { log } from "../utils/mainLogger";

export class LinkInterceptionService {
  private onLinkClickCallback?: (url: string, sourceBlockId?: string) => void;

  constructor(private appView: WebContentsView) {
    this.setupLinkInterception();
  }

  // Method to set the link click callback
  public setLinkClickCallback(
    callback: (url: string, sourceBlockId?: string) => void
  ) {
    this.onLinkClickCallback = callback;
  }

  private setupLinkInterception() {
    // Handle new window requests with disposition check
    this.appView.webContents.setWindowOpenHandler(({ url, disposition }) => {
      log.debug(
        `New window request in main renderer, URL: ${url}, disposition: ${disposition}`,
        "LinkInterceptionService"
      );

      // Only create new blocks for actual "new tab/window" scenarios
      if (
        disposition === "foreground-tab" ||
        disposition === "background-tab" ||
        disposition === "new-window"
      ) {
        log.debug(
          `Creating new block for disposition: ${disposition}`,
          "LinkInterceptionService"
        );
        this.handleLinkClick(url, undefined);
        return { action: "deny" };
      }

      // Allow default disposition to navigate in current page
      log.debug(
        `Allowing navigation in current page for disposition: ${disposition}`,
        "LinkInterceptionService"
      );
      return { action: "deny" };
    });

    // Handle regular link navigation within the main renderer - allow all navigation to proceed
    this.appView.webContents.on("will-navigate", (event, url) => {
      const currentUrl = this.appView.webContents.getURL();

      log.debug(
        `Navigation event in main renderer, from: ${currentUrl} to: ${url}`,
        "LinkInterceptionService"
      );

      // Allow all navigation to proceed - new blocks are only created via setWindowOpenHandler
      log.debug(
        `Allowing navigation in main renderer: ${url}`,
        "LinkInterceptionService"
      );
    });
  }

  // Handle link clicks by creating a new site block
  private handleLinkClick(url: string, sourceBlockId?: string) {
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
        this.onLinkClickCallback(url, sourceBlockId);
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
