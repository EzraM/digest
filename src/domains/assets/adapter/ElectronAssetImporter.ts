import { net, type Session } from "electron";
import type { AssetRef, ImportAssetOptions } from "../core/types";
import { SqliteAssetStore } from "./SqliteAssetStore";

export type AssetSource =
  | { kind: "bytes"; bytes: ArrayBuffer | Uint8Array; mediaType: string; name: string }
  | { kind: "url"; url: string; session?: Session }
  | { kind: "data-url"; url: string };

export class ElectronAssetImporter {
  constructor(private readonly store: SqliteAssetStore) {}

  async import(
    source: AssetSource,
    options: ImportAssetOptions = {}
  ): Promise<AssetRef | null> {
    if (source.kind === "bytes") {
      return this.store.save({
        bytes: source.bytes,
        mediaType: source.mediaType,
        name: source.name,
        ...options,
      });
    }
    if (source.kind === "data-url") {
      const match = source.url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
      if (!match || !(match[1] ?? "image/png").startsWith("image/")) return null;
      const bytes = match[2]
        ? Buffer.from(match[3] ?? "", "base64")
        : Buffer.from(decodeURIComponent(match[3] ?? ""), "utf8");
      return this.store.save({
        bytes,
        mediaType: match[1] ?? "image/png",
        name: options.name ?? "imported-image",
        ...options,
      });
    }

    if (!/^https?:\/\//i.test(source.url)) return null;
    try {
      const response = await (source.session
        ? source.session.fetch(source.url)
        : net.fetch(source.url));
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength) return null;
      const header = response.headers.get("content-type") ?? "";
      const mediaType = header.startsWith("image/")
        ? header.split(";")[0].trim()
        : "image/png";
      return this.store.save({
        bytes,
        mediaType,
        name: options.name ?? this.nameFromUrl(source.url),
        ...options,
      });
    } catch {
      return null;
    }
  }

  private nameFromUrl(url: string): string {
    try {
      const segment = new URL(url).pathname.split("/").pop();
      return segment && segment.includes(".") ? segment : "imported-image";
    } catch {
      return "imported-image";
    }
  }
}
