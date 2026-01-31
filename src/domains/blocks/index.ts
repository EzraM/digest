// Blocks Domain
//
// Manages block operations, persistence, and search indexing.
//
// Structure:
//   core/      - Pure types and interfaces (no dependencies)
//   services/  - Implementations (Electron, Y.js, SQLite)
//   adapters/  - External system integration (BlockNote, IPC)
//   hooks/     - React hooks for renderer

export * from './core';
export * from './services';
export * from './adapters';
