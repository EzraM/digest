// Search Services
//
// Phase 2 implementations for semantic search:
// - Embedding providers (OpenAI, Voyage, Mock)
// - Vector storage (SQLite-vec)
// - Search index coordination

export {
  SqliteVectorStore,
  type VectorStoreConfig,
} from "./SqliteVectorStore";

export {
  OpenAIEmbeddingProvider,
  VoyageEmbeddingProvider,
  MockEmbeddingProvider,
  createEmbeddingProvider,
  type OpenAIEmbeddingConfig,
  type VoyageEmbeddingConfig,
  type EmbeddingProviderType,
  type CreateEmbeddingProviderOptions,
} from "./EmbeddingProvider";

export { SearchIndexService } from "./SearchIndexService";

export {
  SearchIndexManager,
  type SearchIndexManagerConfig,
} from "./SearchIndexManager";
