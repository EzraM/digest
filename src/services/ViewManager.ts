import { WebContentsView, BrowserWindow } from "electron";
import { Subject } from "rxjs";
import set from "lodash/set";
import { BlockEvent, BlockViewState } from "../types/window";

export class ViewManager {
  private views: BlockViewState = {};
  private events$ = new Subject<BlockEvent>();

  constructor(private baseWindow: BrowserWindow) {
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.events$.subscribe((ev) => {
      const { blockId } = ev;

      if (ev.type === "set-url") {
        set(this.views, [blockId, "url"], ev.url);
      }
      if (ev.type === "set-layout") {
        set(this.views, [blockId, "bounds"], ev.bounds);
      }

      this.handleViewCreation(blockId);
      this.handleViewUpdate(blockId, ev);
    });
  }

  private handleViewCreation(blockId: string) {
    const view = this.views[blockId];
    if (view?.url && view?.bounds && !view?.contents) {
      const newView = new WebContentsView();
      newView.webContents.loadURL(view.url);
      newView.setBounds(view.bounds);
      this.baseWindow.contentView.addChildView(newView);
      this.views[blockId].contents = newView;
    }
  }

  private handleViewUpdate(blockId: string, ev: BlockEvent) {
    const view = this.views[blockId];
    if (view?.contents && ev.type === "set-layout") {
      view.contents.setBounds(ev.bounds);
    }
  }

  public handleLayoutUpdate(layout: any) {
    this.events$.next({ ...layout, type: "set-layout" });
  }

  public handleUrlUpdate(url: any) {
    this.events$.next({ ...url, type: "set-url" });
  }
}
