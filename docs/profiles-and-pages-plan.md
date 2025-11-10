# Profile & Document System - Implementation Plan

## 1. Core Concepts

### Profile
- **Top-level container** with its own:
  - Cookie/session isolation (separate Electron partition)
  - File tree of documents
  - Can have its own content (root document)
  - Acts as a workspace boundary

### Document
- **Content unit** containing:
  - Ordered set of BlockNote blocks
  - Own Y.js document instance (sync boundary)
  - Own operation history in SQLite
  - Position in file tree hierarchy
  - Belongs to a profile

---

## 2. Database Schema Changes

### New Tables (Migration 003)

```sql
-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  partition_name TEXT NOT NULL,  -- Electron session partition
  icon TEXT,
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  settings TEXT  -- JSON for profile-specific settings
);

CREATE INDEX idx_profiles_created ON profiles(created_at);
```

### Modified Tables

**documents** - Add profile and hierarchy fields:
```sql
-- Add new columns for profile and tree structure
ALTER TABLE documents ADD COLUMN profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN parent_document_id TEXT REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN is_expanded BOOLEAN DEFAULT true;
ALTER TABLE documents ADD COLUMN deleted_at INTEGER; -- Null = active

-- Create indexes for performance
CREATE INDEX idx_documents_profile ON documents(profile_id);
CREATE INDEX idx_documents_parent ON documents(parent_document_id);
CREATE INDEX idx_documents_position ON documents(profile_id, position);
```

**operations** - No changes needed (already has `document_id`)

---

## 3. Architecture Changes

### 3.1 Sync Boundary Changes

**Current**: Single Y.Doc for entire application
**New**: One Y.Doc per document

```
┌─────────────────────────────────────────────┐
│ Profile 1 (partition:profile-1)            │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ Document A (Y.Doc A, id: A)        │   │
│  │  - Browser blocks share partition  │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ Document B (Y.Doc B, id: B)        │   │
│  │  - Browser blocks share partition  │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Profile 2 (partition:profile-2)            │
│  - Separate cookie container                │
└─────────────────────────────────────────────┘
```

**Key Changes**:
- BlockOperationService.ts:26 - Make non-singleton, instantiate per document
- useDocumentSync.ts:10 - Accept `documentId` parameter
- Each document maintains own operation history with `document_id` filter

### 3.2 ViewManager Architecture: Profile-as-View-Attribute

**Key Design**: Profile information travels with each view as metadata, rather than ViewManager owning a profile context.

```typescript
// Browser block view with profile metadata
interface BrowserBlockView {
  contents: WebContentsView;
  url: string;
  bounds: Rectangle;
  profileId: string;    // ← Profile travels with the view
  partition: string;    // ← Partition specified at creation
}

class ViewManager {
  private views: Map<string, BrowserBlockView>;

  // ViewManager doesn't own profile - just manages views with their metadata
  constructor(
    private baseWindow: BrowserWindow,
    private viewLayerManager: ViewLayerManager | undefined,
    rendererWebContents: Electron.WebContents
  ) { }

  private handleViewCreation(blockId: string, profileId: string) {
    const partition = `persist:${profileId}`;

    const newView = new WebContentsView({
      webPreferences: {
        partition: partition,  // ← Partition specified per-view
        // ... other preferences
      },
    });

    this.views.set(blockId, {
      contents: newView,
      url: url,
      bounds: bounds,
      profileId: profileId,  // ← Store profile with view
      partition: partition,
    });
  }
}
```

**Key Advantages**:
- **No cleanup cascade**: Switching documents across profiles doesn't destroy WebContents
- **Fast cross-profile document switching**: Views persist and are shown/hidden as needed
- **Natural caching**: Views live until explicitly cleaned up (time-based, LRU, memory pressure)
- **Simpler state management**: ViewManager doesn't need to "know" what profile it's serving
- **No transition complexity**: No careful cleanup choreography when switching profiles

### 3.3 Document Switching Flow

#### **All Document Switches (Fast - Same Flow)**

Switching between documents is uniform, regardless of profile:

```typescript
async switchDocument(documentId: string) {
  const newDoc = await documentManager.getDocument(documentId);

  // 1. Load new document
  await blockOperationService(documentId).loadDocument();

  // 2. Update renderer with new document
  editor.replaceBlocks(editor.document, newBlocks);

  // 3. For each browser block in the new document:
  for (const block of newDoc.blocks.filter(b => b.type === 'browser')) {
    viewManager.handleBlockViewUpdate({
      blockId: block.id,
      url: block.url,
      bounds: block.bounds,
      profileId: newDoc.profileId,  // ← Profile comes from document
      partition: `persist:${newDoc.profileId}`,
    });
  }

  // 4. ViewManager reuses existing WebContents if they exist,
  //    or creates new ones with the correct partition

  // 5. Update UI (highlight active document in tree)
}
```

**Performance**: Fast in all cases - existing views are reused when possible

#### **Profile Cleanup Strategy**

Views can be cleaned up lazily based on usage patterns:

```typescript
class ViewManager {
  private viewLastUsed: Map<string, number> = new Map();

  // Track when views are last used
  private touchView(blockId: string) {
    this.viewLastUsed.set(blockId, Date.now());
  }

  // Periodic cleanup of stale views (e.g., every 5 minutes)
  private cleanupStaleViews(maxAge: number = 5 * 60 * 1000) {
    const now = Date.now();
    for (const [blockId, lastUsed] of this.viewLastUsed) {
      if (now - lastUsed > maxAge) {
        this.handleViewRemoval(blockId);
      }
    }
  }

  // Or: cleanup views from inactive profiles
  cleanupProfileViews(profileId: string) {
    for (const [blockId, view] of this.views) {
      if (view.profileId === profileId) {
        this.handleViewRemoval(blockId);
      }
    }
  }
}
```

> **Note**: Cleanup APIs stay documented for future work, but no eviction timers or background pruning ships in this milestone.

#### **Moving Document to Different Profile**

```typescript
async moveDocumentToProfile(documentId: string, newProfileId: string) {
  // 1. Update database
  await db.run(
    'UPDATE documents SET profile_id = ? WHERE id = ?',
    newProfileId,
    documentId
  );

  // 2. If this is the active document, reload browser blocks
  if (documentId === activeDocument?.id) {
    // Browser blocks will be recreated with new partition
    // Old views from previous profile can be cleaned up lazily
    await switchDocument(documentId);
  }
}
```

---

## 4. Service Architecture

### 4.1 New Services

#### **ProfileManager** (`src/services/ProfileManager.ts`)
```typescript
class ProfileManager {
  private profiles: Map<string, Profile>;

  createProfile(name: string): Profile;
  deleteProfile(profileId: string): Promise<void>;
  getProfile(profileId: string): Profile;
  listProfiles(): Profile[];
  getProfilePartition(profileId: string): string;
}
```

#### **DocumentManager** (`src/services/DocumentManager.ts`)
```typescript
class DocumentManager {
  private documents: Map<string, Document>;
  private activeDocument: Document | null;
  private blockOperationServices: Map<string, BlockOperationService>;

  createDocument(profileId: string, title: string, parentId?: string): Document;
  deleteDocument(documentId: string): Promise<void>; // Performs soft delete
  moveDocument(documentId: string, newParent: string | null, position: number): void;
  moveDocumentToProfile(documentId: string, newProfileId: string): Promise<void>;
  switchDocument(documentId: string): Promise<void>;
  getDocumentTree(profileId: string): DocumentTreeNode[];

  // Get or create BlockOperationService for document
  getBlockService(documentId: string): BlockOperationService;
}
```

### 4.2 Modified Services

**BlockOperationService** - Per-document instances:
```typescript
// Remove singleton pattern
constructor(documentId: string) {
  this.documentId = documentId;
  // ... rest of initialization
}
```

**ViewManager** - Profile metadata stored per-view:
```typescript
class ViewManager {
  private views: Map<string, BrowserBlockView>;  // Profile stored in view

  constructor(
    private baseWindow: BrowserWindow,
    private viewLayerManager: ViewLayerManager | undefined,
    rendererWebContents: Electron.WebContents
  ) { }

  // Update block view with profile information
  handleBlockViewUpdate(update: {
    blockId: string;
    url: string;
    bounds: Rectangle;
    profileId: string;    // ← Profile passed per-update
    partition: string;
  }): void {
    // Create or update view with profile metadata
  }

  // Lazy cleanup methods
  cleanupStaleViews(maxAge?: number): void;
  cleanupProfileViews(profileId: string): void;
}
```

---

## 5. UI Components

### 5.1 File Tree Sidebar (`src/components/FileTree/`)

**Note**: Use Mantine's [Tree component](https://mantine.dev/x/tree/) for the file tree UI implementation. It provides built-in support for nested structures, drag-and-drop, and styling that will integrate well with our Mantine-based overlay system.

**Sidebar transition**: The existing floating sidebar (with calendar/history/etc.) is removed entirely in this milestone. The new FileTree becomes the only sidebar in the main layout and is permanently anchored on the left edge of the app window. No modules, widgets, or content from the legacy sidebar are preserved—if a capability matters, it must be rethought elsewhere. Nothing remains in the original overlay once the profiles/pages tree ships.

```
FileTree.tsx              - Main container
├── ProfileList.tsx       - Profile switcher at top
├── DocumentTree.tsx      - Recursive tree component (using Mantine Tree)
├── DocumentTreeNode.tsx  - Individual document with drag/drop
└── DocumentActions.tsx   - Context menu (rename, delete, move)
```

**Features**:
- Sidebar panel is toggle-able (toolbar button + `Cmd+\`` shortcut TBD) and persists last-open state in renderer store
- Drag-and-drop document reordering
- Nested documents (folder-like structure) with a maximum depth of **4** levels (root + 3 descendants); moving/creating deeper nodes is disabled in the UI + validated in main process
- Right-click context menu
- Keyboard shortcuts (Cmd+N for new document, etc.)
- Visual indicator for active document
- Show profile boundary clearly (documents belong to profile)

### 5.2 Main Layout Changes (`src/renderer.tsx`)

```tsx
<Layout>
  <Sidebar>
    <FileTree
      profiles={profiles}
      activeProfile={activeProfile}
      onSelectDocument={handleDocumentSwitch}
      onCreateDocument={handleCreateDocument}
      onDeleteDocument={handleDeleteDocument}
      onMoveDocument={handleMoveDocument}
      onMoveDocumentToProfile={handleMoveDocumentToProfile}
    />
  </Sidebar>

  <MainContent>
    <DocumentEditor
      documentId={activeDocument.id}
      profileId={activeDocument.profileId}
      editor={editor}  // BlockNote editor
    />
  </MainContent>
</Layout>
```

---

## 6. Document Switching Flow

### Unified Document Switching (Fast in All Cases)

```
1. User clicks "Document B" (may be in different profile)
   ↓
2. DocumentManager.switchDocument("doc-b")
   ↓
3. Save current document state (if dirty)
   └─ BlockOperationService(current).createSnapshot()
   ↓
4. Load new document
   └─ BlockOperationService(doc-b).loadDocument()
   ↓
5. Renderer receives new document
   └─ editor.replaceBlocks(editor.document, newBlocks)
   ↓
6. Update browser blocks with profile metadata
   └─ For each browser block:
       viewManager.handleBlockViewUpdate({
         blockId, url, bounds,
         profileId: newDoc.profileId,  // ← Profile from document
         partition: `persist:${newDoc.profileId}`
       })
   └─ ViewManager reuses existing views or creates new ones
   └─ Existing views from other profiles remain in memory
   ↓
7. Update UI (highlight active document in tree)
```

**Performance**: Fast - views are reused when possible, no forced cleanup

### Moving Document Between Profiles

```
1. User drags "Document B" to "Profile 2"
   ↓
2. DocumentManager.moveDocumentToProfile("doc-b", "profile-2")
   └─ Updates database: documents.profile_id = "profile-2"
   ↓
3. If doc-b is currently active:
   └─ switchDocument("doc-b")
   └─ Browser blocks recreated with new partition
   └─ Old views can be cleaned up lazily
```

**Performance**: Fast - no cascade cleanup, views recreated as needed

### Cross-Profile Copy / Move Semantics

- Copying or moving documents between profiles is supported both via the sidebar tree and dedicated actions.
- When a document is opened in a different profile, its browser blocks spawn new WebContents instances using the destination profile's partition, resulting in isolated cookie/storage state.
- Some authenticated pages may no longer load if the destination partition lacks credentials; this is **expected** and conveys the profile boundary to the user.
- Old views tied to the previous profile remain cached until naturally reclaimed; no cleanup choreography is required for the initial release.

---

## 7. Migration Strategy

### Phase 1: Database Setup
1. Create migration 003 with new profile table and document columns
2. Create default profile ("Default")
3. Migrate existing documents to belong to default profile
4. Set default values for position and parent_document_id

### Phase 2: Service Refactoring
1. Make BlockOperationService non-singleton
2. Add ProfileManager and DocumentManager
3. Update ServiceRegistry and Container
4. Update ViewManager to store profile metadata per-view
5. Defer view cleanup/lazy eviction logic for a future pass (document API boundaries so it can be slotted in later)

### Phase 3: UI Implementation
1. Create FileTree components
2. Add sidebar to main layout
3. Implement document switching logic
4. Wire up IPC handlers for document operations

### Phase 4: Testing & Polish
1. Test cross-profile cookie isolation
2. Test document switching performance (same and different profiles)
3. Test view caching and reuse behavior
4. Test drag-and-drop operations
5. Handle edge cases (delete active document, etc.)
6. Test lazy cleanup of stale views

---

## 8. Key Technical Considerations

### 8.1 Memory Management
- Dispose Y.Doc instances for inactive documents
- Keep only active document + adjacent documents in memory
- Lazy-load BlockOperationService instances
- View cleanup / eviction is explicitly **out of scope** for this milestone; plan for future hooks instead of implementing timers now

### 8.2 Browser Block State
- **All document switches**: Fast, views cached and reused when possible
- Views persist across profile switches
- Store browser block URLs in document
- Profile metadata travels with each view
- No cascade cleanup when switching profiles
- Partition naming remains `persist:${profileId}` (no additional naming scheme work needed)

### 8.3 Focus Management
Critical scenarios:
- Document switch (any profile) → BlockNote editor regains focus
- Create new document → Focus new document in tree → Editor gets focus
- Delete active document → Switch to adjacent document → Focus editor
- Browser block state preserved during fast document switching

### 8.4 IPC Events
New events needed:
```typescript
// Main → Renderer
'document:switched'        // Active document changed
'document-tree:updated'    // Tree structure changed

// Renderer → Main
'document:create'
'document:delete'
'document:move'            // Move document (main process checks if profile changed)
'document:rename'
'profile:create'
'profile:delete'
```

### 8.5 Deletion & Undo
- Implement **soft delete** for documents (mark `deleted_at` or `is_deleted`, exclude from default tree queries)
- Recovery UI/workflows are out of scope; rely on manual SQL for now if absolutely needed
- Track delete/move/create actions in a centralized **global events stack** (in-memory queue persisted to SQLite) that can later power undo/redo across renderer + main
- Each event should include enough metadata (document id, previous parent/position/profile, timestamp) to replay or roll back actions when undo support ships

---

## 9. Implementation Order

1. **Database migration** (003_add_profiles_documents.ts)
2. **ProfileManager service** (create, list, partition management)
3. **DocumentManager service** (create, switch, tree operations)
4. **Refactor BlockOperationService** (remove singleton)
5. **Update ViewManager** (profile-as-attribute, update handleBlockViewUpdate)
6. **Update main.ts** (pass profile metadata to ViewManager)
7. **FileTree UI components** (tree rendering only)
8. **Wire IPC handlers** (document/profile operations)
9. **Implement document switching** (unified fast path)
10. **Add drag-and-drop** (document reordering)
11. **Implement soft delete plumbing (no recovery UI) + event logging**
12. **Polish & testing**

---

## 10. Open Questions

All major decisions for this milestone are locked; future enhancements (e.g., richer template systems, recovery UI, view eviction policies) can be tracked separately when they move back into scope.

---

## 11. Out-of-Scope Items

- **Document templates**: nice-to-have but excluded for now; keep API surface clean so templates can plug into DocumentManager later.
- **View cleanup / eviction timers**: plan remains to add LRU-based cleanup, but implementation waits until post-sidebar polish work.
