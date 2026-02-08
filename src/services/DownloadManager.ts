import { app, BrowserWindow, DownloadItem, WebContents, shell } from "electron";
import path from "path";
import fs from "fs";
import { log } from "../utils/mainLogger";
import { DatabaseManager } from "../database/DatabaseManager";

export interface DownloadInfo {
  id: string;
  fileName: string;
  url: string;
  totalBytes: number;
  receivedBytes: number;
  status: "in_progress" | "completed" | "failed" | "cancelled";
  savePath: string;
}

type DownloadEventCallback = (info: DownloadInfo) => void;

interface ActiveDownload {
  id: string;
  item: DownloadItem;
  savePath: string;
  partPath: string;
}

/**
 * Manages file downloads from browser block WebContents.
 * Downloads to ~/Downloads with a .part suffix during transfer,
 * renames on completion. Tracks metadata in SQLite for crash recovery.
 */
export class DownloadManager {
  private activeDownloads = new Map<string, ActiveDownload>();
  private onStarted?: DownloadEventCallback;
  private onProgress?: DownloadEventCallback;
  private onCompleted?: DownloadEventCallback;
  private onFailed?: DownloadEventCallback;

  setOnStarted(cb: DownloadEventCallback): void {
    this.onStarted = cb;
  }
  setOnProgress(cb: DownloadEventCallback): void {
    this.onProgress = cb;
  }
  setOnCompleted(cb: DownloadEventCallback): void {
    this.onCompleted = cb;
  }
  setOnFailed(cb: DownloadEventCallback): void {
    this.onFailed = cb;
  }

  /**
   * Attach download handling to a WebContents session.
   * Call this for each browser block's webContents.
   */
  attachToWebContents(webContents: WebContents): void {
    const ses = webContents.session;

    ses.on("will-download", (_event, item, _webContents) => {
      this.handleDownload(item);
    });
  }

  /**
   * Cancel an active download.
   */
  cancel(downloadId: string): void {
    const active = this.activeDownloads.get(downloadId);
    if (active) {
      active.item.cancel();
    }
  }

  /**
   * Open the folder containing a downloaded file with the file selected.
   */
  showInFolder(filePath: string): void {
    shell.showItemInFolder(filePath);
  }

  /**
   * Clean up stale in-progress rows on startup.
   */
  recoverFromCrash(): void {
    try {
      const db = DatabaseManager.getInstance().getDatabase();
      const stale = db
        .prepare(
          `SELECT id, save_path FROM download_items WHERE status = 'in_progress'`
        )
        .all() as { id: string; save_path: string | null }[];

      for (const row of stale) {
        // Clean up .part file if it exists
        if (row.save_path) {
          const partPath = row.save_path + ".part";
          try {
            if (fs.existsSync(partPath)) {
              fs.unlinkSync(partPath);
            }
          } catch {
            // Ignore cleanup errors
          }
        }

        db.prepare(`UPDATE download_items SET status = 'failed', updated_at = ? WHERE id = ?`).run(
          Date.now(),
          row.id
        );
      }

      // Remove completed rows that stuck around (crash between save and cleanup)
      db.prepare(`DELETE FROM download_items WHERE status IN ('completed', 'failed', 'cancelled')`).run();

      if (stale.length > 0) {
        log.debug(`Cleaned up ${stale.length} stale downloads`, "DownloadManager");
      }
    } catch (error) {
      log.debug(`Crash recovery error: ${error}`, "DownloadManager");
    }
  }

  private handleDownload(item: DownloadItem): void {
    const id = `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileName = this.deduplicateFileName(item.getFilename());
    const downloadsDir = app.getPath("downloads");
    const savePath = path.join(downloadsDir, fileName);
    const partPath = savePath + ".part";

    // Save to .part file during download
    item.setSavePath(partPath);

    const active: ActiveDownload = { id, item, savePath, partPath };
    this.activeDownloads.set(id, active);

    // Persist metadata to SQLite
    this.persistDownloadStart(id, fileName, item.getURL(), item.getTotalBytes(), savePath);

    const info = (): DownloadInfo => ({
      id,
      fileName,
      url: item.getURL(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: item.getReceivedBytes(),
      status: "in_progress",
      savePath,
    });

    log.debug(`Download started: ${fileName} (${id})`, "DownloadManager");
    this.onStarted?.(info());

    // Throttle progress updates to avoid flooding IPC
    let lastProgressTime = 0;
    item.on("updated", (_event, state) => {
      if (state === "progressing") {
        const now = Date.now();
        if (now - lastProgressTime < 250) return; // Max 4 updates/sec
        lastProgressTime = now;

        this.updateDownloadProgress(id, item.getReceivedBytes());
        this.onProgress?.(info());
      }
    });

    item.once("done", (_event, state) => {
      this.activeDownloads.delete(id);

      if (state === "completed") {
        // Rename .part → final file
        try {
          fs.renameSync(partPath, savePath);
          this.completeDownload(id);

          const completedInfo: DownloadInfo = {
            ...info(),
            receivedBytes: item.getTotalBytes(),
            status: "completed",
          };
          log.debug(`Download completed: ${fileName}`, "DownloadManager");
          this.onCompleted?.(completedInfo);
        } catch (error) {
          log.debug(`Failed to rename .part file: ${error}`, "DownloadManager");
          this.failDownload(id);
          this.onFailed?.({ ...info(), status: "failed" });
        }
      } else if (state === "cancelled") {
        // Clean up .part file
        try {
          if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
        } catch { /* ignore */ }

        this.cancelDownload(id);
        this.onFailed?.({ ...info(), status: "cancelled" });
        log.debug(`Download cancelled: ${fileName}`, "DownloadManager");
      } else {
        // interrupted
        try {
          if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
        } catch { /* ignore */ }

        this.failDownload(id);
        this.onFailed?.({ ...info(), status: "failed" });
        log.debug(`Download failed: ${fileName}`, "DownloadManager");
      }
    });
  }

  private deduplicateFileName(fileName: string): string {
    const downloadsDir = app.getPath("downloads");
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    let candidate = fileName;
    let counter = 1;

    while (
      fs.existsSync(path.join(downloadsDir, candidate)) ||
      fs.existsSync(path.join(downloadsDir, candidate + ".part"))
    ) {
      candidate = `${base} (${counter})${ext}`;
      counter++;
    }

    return candidate;
  }

  // --- SQLite persistence (metadata only) ---

  private persistDownloadStart(
    id: string,
    fileName: string,
    url: string,
    totalBytes: number,
    savePath: string
  ): void {
    try {
      const db = DatabaseManager.getInstance().getDatabase();
      db.prepare(
        `INSERT INTO download_items (id, file_name, url, total_bytes, received_bytes, status, save_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 'in_progress', ?, ?, ?)`
      ).run(id, fileName, url, totalBytes, savePath, Date.now(), Date.now());
    } catch (error) {
      log.debug(`Failed to persist download start: ${error}`, "DownloadManager");
    }
  }

  private updateDownloadProgress(id: string, receivedBytes: number): void {
    try {
      const db = DatabaseManager.getInstance().getDatabase();
      db.prepare(
        `UPDATE download_items SET received_bytes = ?, updated_at = ? WHERE id = ?`
      ).run(receivedBytes, Date.now(), id);
    } catch (error) {
      // Non-critical — don't log every progress update failure
    }
  }

  private completeDownload(id: string): void {
    try {
      const db = DatabaseManager.getInstance().getDatabase();
      db.prepare(`DELETE FROM download_items WHERE id = ?`).run(id);
    } catch (error) {
      log.debug(`Failed to clean up download row: ${error}`, "DownloadManager");
    }
  }

  private failDownload(id: string): void {
    try {
      const db = DatabaseManager.getInstance().getDatabase();
      db.prepare(
        `UPDATE download_items SET status = 'failed', updated_at = ? WHERE id = ?`
      ).run(Date.now(), id);
    } catch (error) {
      log.debug(`Failed to mark download as failed: ${error}`, "DownloadManager");
    }
  }

  private cancelDownload(id: string): void {
    try {
      const db = DatabaseManager.getInstance().getDatabase();
      db.prepare(`DELETE FROM download_items WHERE id = ?`).run(id);
    } catch (error) {
      log.debug(`Failed to clean up cancelled download row: ${error}`, "DownloadManager");
    }
  }
}
