// Blocks Domain
//
// Manages block operations, persistence, and search indexing.
//
// Structure:
//   core/      - Pure types and interfaces (no dependencies)
//   services/  - Implementations (Electron, Y.js, SQLite)
//   hooks/     - React hooks for renderer

export * from './core';
export * from './services';
