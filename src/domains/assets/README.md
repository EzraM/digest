# Assets

Assets are locally managed binary content. Images are currently the only
accepted media type, but callers depend on the asset capability rather than on
SQLite or the `digest-image` protocol.

The boundary has four small parts:

- `assetAddress` creates and parses stable renderer addresses.
- `SqliteAssetStore` persists and opens bytes and metadata.
- `ElectronAssetImporter` acquires bytes from IPC input, data URLs, or web
  sessions.
- `AssetLifecycle` attaches draft assets to documents and releases assets.

`AssetService` is the application-facing API. Electron IPC and protocol
registration are adapters around that API and its store. Document reference
analysis is responsible for releasing assets that disappear from canonical
document state.
