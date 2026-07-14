# BlockNote Image Blocks (local-first, no HTTP)

## Goals & constraints
- Enable BlockNote image blocks backed by the local SQLite DB, staying within the existing IPC main/renderer split.
- Avoid adding HTTP endpoints or background servers; prefer Electron protocols/IPCs to dodge port conflicts.
- Prototype-level: no quotas/limits yet; keep structure so limits/cleanup can be added later.

## Prior art (BlockNote)
- BlockNote ships an `image` block that expects an `uploadFile` handler returning a URL; drag/paste routes through the same hook.
- Rendering is standard `<img>`/`<picture>`; providing width/height avoids layout shift.
- We can reuse their built-in block spec and supply a custom upload handler that talks to our IPC.

## Data model (SQLite)
- New `images` table (migration 00x): `id TEXT PRIMARY KEY`, `file_name TEXT`, `mime_type TEXT`, `byte_length INTEGER`, `width INTEGER NULL`, `height INTEGER NULL`, `created_at INTEGER`, `owner_profile_id TEXT NULL`, `document_id TEXT NULL`, `blob BLOB NOT NULL`.
- Index on `(document_id)` for cleanup; keep `created_at` for ordering/orphan sweeps later.
- Keep blobs inside SQLite for a single-file footprint; WAL already in use. We can move to filesystem-backed blobs if needed without changing the BlockNote-facing API (URL stays `digest-image://<id>`).

## Serving bytes without HTTP
- Register an Electron custom protocol in the main process: `protocol.registerBufferProtocol("digest-image", handler)`.
- Handler fetches `blob`, `mime_type` from SQLite and returns `{ mimeType, data }`; cache-control can be implicit (renderer cache) or we add ETag later.
- CSP: add `img-src digest-image: data: https:` to the main renderer CSP to allow the new scheme.
- Optional: add `digest-thumb://` later if we store generated thumbnails.

## IPC surface (renderer ↔ main)
- Renderer calls `window.electronAPI.saveImage({ arrayBuffer, mimeType, fileName, width, height, documentId? })`.
- Main validates MIME and size (even if soft), inserts into `images`, returns `{ id, url: "digest-image://<id>", width, height }`.
- Add `window.electronAPI.getImageInfo(id)` if the renderer needs to confirm metadata without fetching bytes.
- Wire through `IPCRouter` + a new `ImageService` that depends on the database handle (mirroring `BlockOperationService` pattern).

## BlockNote integration
- Extend the BlockNote editor config to enable the built-in `image` block.
- Provide `uploadFile` implementation that:
  1) Reads the File/Blob into an ArrayBuffer (stream if easy, otherwise `arrayBuffer()` for now).
  2) Calls `saveImage` IPC; receives `digest-image://...`.
  3) Returns that URL to BlockNote; store `width/height` on the block props if available to reduce layout shift.
- Handle paste/drag by reusing the same `uploadFile` hook; surface errors via existing notification/toast pattern.

## Persistence & snapshots
- Block operations already persist document structure; image bytes live separately in `images`. Block payload stores only the `src` URL (`digest-image://id`) plus metadata (`alt`, `title`, `width`, `height`).
- Snapshot loading remains unchanged; when replaying operations, the renderer will resolve `digest-image://…` via the protocol handler.
- Document deletion cleanup can cascade later (delete images with `document_id`), but not required for prototype.

## Work steps (incremental)
1) Migration: add `images` table; update CSP to allow `digest-image:`.
2) Main: `ImageService` (insert/select), protocol registration, IPC handlers.
3) Renderer: `electronAPI.saveImage` preload bridge; BlockNote `uploadFile` hook wired to IPC, enable `image` block spec.
4) QA: paste + drag in the editor, offline reload of a doc with images, verify no port usage and images render after restart.
