# Workspace Domain - Inline Workspace Redesign

## Vision

Replace the current slash command overlay (HUD) with an **inline workspace** that opens at the cursor. Instead of memorizing discrete commands, users type naturally and the system retrieves, reasons, and assists.

### Current State (to be replaced)
```
User types "/" → Overlay appears → User selects block type → Block inserted
```

### Target State
```
User triggers workspace → Inline region opens at cursor → User types naturally
                        → System retrieves relevant notes (embeddings)
                        → System may pull web results
                        → System may open conversation
                        → User selects/inserts what they need
```

## Key Principles

1. **No commands to memorize** - Natural language interaction
2. **Contextual retrieval** - Notes found by semantic similarity, not exact match
3. **Inline, not overlay** - Part of the document flow, not a separate layer
4. **Pluggable backends** - Swappable embedding providers, agents, search systems
5. **Clear data contracts** - Well-defined boundaries for rapid iteration

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION                            │
│                     (trigger opens workspace)                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 5: UI CONTRACT                                               │
│  ─────────────────────                                              │
│  WorkspaceState → WorkspaceView                                     │
│  - Inline bordered region at cursor                                 │
│  - Renders: input, results, conversation                            │
│  - Emits: user actions (select, query, dismiss)                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 4: CONTEXT ASSEMBLY CONTRACT                                 │
│  ─────────────────────────────────                                  │
│  (RetrievedNotes, WebResults, ConversationState) → AssembledContext │
│  - Merges multiple sources                                          │
│  - Ranks by relevance                                               │
│  - Decides what to surface                                          │
└─────────────────────────────────────────────────────────────────────┘
                        ╱           │           ╲
                       ▼            ▼            ▼
┌──────────────────────────┐ ┌──────────────┐ ┌──────────────────────┐
│ LAYER 3a: RETRIEVAL      │ │ LAYER 3b:    │ │ LAYER 3c: AGENT      │
│ ──────────────────────── │ │ WEB SEARCH   │ │ LOOP CONTRACT        │
│ Query → RankedNotes      │ │ ──────────── │ │ ──────────────────── │
│ - Embedding search       │ │ Query →      │ │ Context → Response   │
│ - Vector store           │ │ WebResults   │ │ - Pluggable agents   │
│ - Similarity ranking     │ │              │ │ - Tool definitions   │
└──────────────────────────┘ └──────────────┘ └──────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 2: SEARCH INDEX CONTRACT                                     │
│  ───────────────────────────────                                    │
│  SearchableBlock → EmbeddingVector                                  │
│  - Embedding provider (pluggable)                                   │
│  - Vector storage (pluggable)                                       │
│  - Index maintenance                                                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1: BLOCK DATA CONTRACT                                       │
│  ─────────────────────────────                                      │
│  Block → SearchableBlockManifest                                    │
│  - Block type definitions                                           │
│  - Searchability declarations                                       │
│  - Content extraction rules                                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Layer Contracts

### Layer 1: Block Data Contract

Already defined in `domains/blocks/core/types.ts`:

```typescript
interface BlockSearchManifest {
  blockType: string;
  searchableFields: SearchableField[];
  searchWeight?: number;
  excludeFromSearch?: string[];
}

interface SearchableField {
  path: string;           // "props.url", "content"
  fieldType: 'text' | 'url' | 'metadata';
  weight: number;
}
```

### Layer 2: Search Index Contract

Implemented in `domains/search/`:

```typescript
// domains/search/core/types.ts
interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>;
  batchEmbed(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
  readonly providerName: string;
}

interface IVectorStore {
  upsert(id: string, vector: number[], metadata: VectorMetadata): Promise<void>;
  search(queryVector: number[], limit: number): Promise<VectorSearchResult[]>;
  delete(id: string): Promise<void>;
  deleteByDocument(documentId: string): Promise<void>;
  count(): Promise<number>;
}

interface ISearchIndexService {
  indexBlock(block: Block, documentId: string): Promise<void>;
  removeBlock(blockId: string): Promise<void>;
  reindexDocument(documentId: string, blocks: Block[]): Promise<void>;
  search(query: string, context?: RetrievalContext, limit?: number): Promise<RetrievedNote[]>;
}
```

Implementations:
- `SqliteVectorStore` - Uses sqlite-vec for similarity search
- `OpenAIEmbeddingProvider` / `VoyageEmbeddingProvider` / `MockEmbeddingProvider`
- `SearchIndexService` - Coordinates embedding + storage with debouncing
- `SearchIndexManager` - Main process singleton for integration

### Layer 3: Retrieval + Agent Contracts

```typescript
// Note retrieval
interface INoteRetriever {
  retrieve(query: string, context: RetrievalContext): Promise<RetrievedNote[]>;
}

// Web search (optional)
interface IWebSearchProvider {
  search(query: string): Promise<WebResult[]>;
  shouldSearch(query: string, context: WorkspaceContext): boolean;
}

// Agent loop
interface IAgentRunner {
  run(input: AgentInput, config: AgentConfig): AsyncGenerator<AgentEvent>;
}

type AgentEvent =
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; tool: string; params: unknown }
  | { type: 'tool_result'; result: unknown }
  | { type: 'response'; content: string }
  | { type: 'done' };
```

### Layer 4: Context Assembly

```typescript
interface IContextAssembler {
  assemble(inputs: ContextInputs): AssembledContext;
}

interface ContextInputs {
  query: string;
  retrievedNotes: RetrievedNote[];
  webResults?: WebResult[];
  conversationHistory?: Message[];
  currentDocument?: DocumentContext;
}

interface AssembledContext {
  sections: ContextSection[];
  suggestedActions: SuggestedAction[];
  shouldEngageAgent: boolean;
}
```

### Layer 5: UI Contract

```typescript
interface WorkspaceState {
  isOpen: boolean;
  query: string;
  context: AssembledContext;
  selectedIndex: number;
  mode: 'search' | 'conversation' | 'browsing';
}

interface WorkspaceActions {
  onQueryChange: (query: string) => void;
  onSelect: (item: ContextItem) => void;
  onInsert: (block: Block) => void;
  onDismiss: () => void;
  onStartConversation: () => void;
}
```

## Implementation Phases

### Phase 1: Block Search Manifests ✅
- [x] Add manifests to existing block types (paragraph, heading, site, clip)
- [x] Create manifest registry (`domains/search/core/manifests.ts`)
- [x] Text extraction from blocks (`domains/search/core/textExtractor.ts`)

### Phase 2: Search Index Foundation ✅
- [x] Implement `IEmbeddingProvider` (OpenAI, Voyage, Mock)
- [x] Implement `IVectorStore` (sqlite-vec based)
- [x] Create `SearchIndexService` with debounced batching
- [x] Create `SearchIndexManager` for main process integration
- [x] Wire up indexing on block changes (post-write middleware in `ServiceRegistry`)
- [x] FTS5 full-text search wired as default provider (no API key required)
- [ ] Bootstrap indexing on startup (API ready: `manager.bootstrapIndex()`, not yet called)

### Phase 3: Inline Workspace UI ✅
- [x] Register `workspace` block type in `BlockNoteSchema` (`src/types/schema.ts`)
- [x] Intercept `/` via `useSlashCommandBridge` — inserts workspace block, suppresses default menu
- [x] Connect workspace to search service (IPC handlers + preload API)
- [x] Debounced in-doc FTS search (300ms) + Brave web search (1s)
- [x] Ranked merged results: slash commands + notes + web suggestions (`combineSuggestions.ts`)
- [x] Keyboard navigation (↑↓ arrows, Enter, Escape, Tab)
- [x] Note results navigate to source doc/block; web results insert link + open browser

### Phase 4: Context Assembly
- [ ] Implement `IContextAssembler`
- [ ] Ranking/merging logic
- [ ] Add web search provider (optional)

### Phase 5: Agent Integration
- [ ] Implement `IAgentRunner` abstraction
- [ ] Define workspace tools (insert block, search notes, web search)
- [ ] Conversation mode in workspace

### Phase 6: Browser Extension
- [ ] Define agent-accessible interface
- [ ] Clip integration with workspace

## Removed Files

The following files were deleted as part of the inline workspace migration:

| File | Reason |
|------|--------|
| `app-overlay/` | Replaced by inline workspace block |
| `src/app-overlay.preload.ts` | HUD overlay preload script |
| `src/services/AppOverlay.ts` | HUD overlay WebContentsView manager |
| `src/services/SlashCommandManager.ts` | Old command state machine |
| `src/ipc/handlers/slashCommandHandlers.ts` | IPC handlers for old overlay system |

`src/data/slashCommandOptions.ts` is still used by the workspace block for slash command suggestions.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Workspace rendering | Same WebContents as editor | Simpler focus management, no IPC for UI |
| Embedding provider | Pluggable, start with cloud | Can swap to local later |
| Vector storage | SQLite-based | Already have SQLite, simple to start |
| Agent streaming | AsyncGenerator | Real-time UI updates, cancellable |
| Trigger character | Keep `/` initially | Familiar, easy migration path |

## Open Questions

1. **Workspace size/positioning** - Fixed size? Expandable? Full-width?
2. **Conversation persistence** - Save conversation history per document?
3. **Embedding updates** - Real-time or batch? On edit or on save?
4. **Offline mode** - Local embeddings? Cached results?

## Related Domains

- `domains/blocks/` - Block types and operations
- `domains/search/` - Embedding, vector storage, and retrieval
- `domains/clip/` - Web clipping (integrates with workspace)
