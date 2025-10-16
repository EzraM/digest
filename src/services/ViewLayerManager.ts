import { WebContentsView, BaseWindow } from "electron";
import { log } from "../utils/mainLogger";

export enum ViewLayer {
  BACKGROUND = 0, // Main app content
  BROWSER_BLOCKS = 10, // Browser block WebContentsViews
  OVERLAYS = 20, // HUD overlays
}

interface ManagedView {
  view: WebContentsView;
  layer: ViewLayer;
  id: string;
}

export class ViewLayerManager {
  private views: Map<string, ManagedView> = new Map();
  private baseWindow: BaseWindow;

  constructor(baseWindow: BaseWindow) {
    this.baseWindow = baseWindow;
  }

  /**
   * Add a view with explicit layer management
   */
  addView(id: string, view: WebContentsView, layer: ViewLayer): void {
    log.debug(`Adding view ${id} to layer ${layer}`, "ViewLayerManager");

    // Store the view
    this.views.set(id, { view, layer, id });

    // Re-order all views
    this.reorderViews();
  }

  /**
   * Remove a view from management
   */
  removeView(id: string): void {
    const managedView = this.views.get(id);
    if (managedView) {
      log.debug(`Removing view ${id}`, "ViewLayerManager");
      this.baseWindow.contentView.removeChildView(managedView.view);
      this.views.delete(id);
    }
  }

  /**
   * Bring a view to the front of its layer
   */
  bringToFront(id: string): void {
    const managedView = this.views.get(id);
    if (managedView) {
      log.debug(
        `Bringing view ${id} to front of layer ${managedView.layer}`,
        "ViewLayerManager"
      );
      this.reorderViews();
    }
  }

  /**
   * Ensure proper z-ordering of all views
   */
  private reorderViews(): void {
    // Sort views by layer, then by insertion order
    const sortedViews = Array.from(this.views.values()).sort(
      (a, b) => a.layer - b.layer
    );

    // Remove all views first
    for (const managedView of sortedViews) {
      try {
        this.baseWindow.contentView.removeChildView(managedView.view);
      } catch (error) {
        // View might not be added yet, ignore
      }
    }

    // Add them back in the correct order
    for (const managedView of sortedViews) {
      this.baseWindow.contentView.addChildView(managedView.view);
      log.debug(
        `Re-added view ${managedView.id} to layer ${managedView.layer}`,
        "ViewLayerManager"
      );
    }
  }

  /**
   * Get all views in a specific layer
   */
  getViewsInLayer(layer: ViewLayer): ManagedView[] {
    return Array.from(this.views.values())
      .filter((v) => v.layer === layer)
      .sort((a, b) => a.layer - b.layer);
  }

  /**
   * Force reordering - useful when external changes occur
   */
  forceReorder(): void {
    log.debug("Force reordering all views", "ViewLayerManager");
    this.reorderViews();
  }
}
