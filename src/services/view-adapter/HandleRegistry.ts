import { WebContentsView } from 'electron';

/**
 * Simple registry mapping block IDs to Electron handles.
 * No logic, just storage.
 */
export class HandleRegistry {
  private handles = new Map<string, WebContentsView>();

  set(id: string, view: WebContentsView): void {
    this.handles.set(id, view);
  }

  get(id: string): WebContentsView | undefined {
    return this.handles.get(id);
  }

  delete(id: string): boolean {
    return this.handles.delete(id);
  }

  has(id: string): boolean {
    return this.handles.has(id);
  }
}
