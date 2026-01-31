// Search Domain Exports
//
// Core types and interfaces for semantic search:
//   - Block manifests (what parts of each block are searchable)
//   - Embedding and vector store contracts
//   - Text extraction utilities
//
// Services (Phase 2):
//   - SqliteVectorStore (sqlite-vec based)
//   - Embedding providers (OpenAI, Voyage, Mock)
//   - SearchIndexService
//
// Usage:
//   import { manifestRegistry, extractTextFromBlock } from '@/domains/search';
//   import { SqliteVectorStore, SearchIndexService } from '@/domains/search';
//   import type { IEmbeddingProvider, IVectorStore } from '@/domains/search';

export * from './core';
export * from './services';
