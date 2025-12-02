# Architecture Improvement Plan: Atom-Inspired Extensibility

## Current Architecture Analysis

### Strengths ✅
1. **Service Container** (`src/services/Container.ts`)
   - Explicit dependency injection
   - Topological dependency resolution
   - Singleton management

2. **Service Registry** (`src/services/ServiceRegistry.ts`)
   - Centralized service definitions
   - Clear dependency graph

3. **IPC Architecture**
   - Main preload: `src/preload.ts` (304 lines, comprehensive API surface)
   - Overlay preload: `src/app-overlay.preload.ts` (67 lines, focused HUD API)
   - Event-driven communication between WebContents

4. **View Layer Management** (`src/services/ViewLayerManager.ts`)
   - Explicit z-ordering via layers (BACKGROUND=0, BROWSER_BLOCKS=10, OVERLAYS=20)

### Current Limitations 🔍

1. **Static Block Registration**
   - `src/types/schema.ts` requires direct modification to add blocks
   - No runtime registration mechanism
   - Community/third-party blocks not possible

2. **Unversioned Services**
   - No semantic versioning for service APIs
   - Breaking changes affect all consumers immediately
   - No graceful degradation path

3. **Manual IPC Handler Registration**
   - 30+ `ipcMain.on/handle` calls in `main.ts`
   - No centralized IPC router
   - Hard to track which channels exist
   - No type safety across process boundaries

4. **Tight Coupling in IPC**
   - Preload exposes specific implementation details
   - Hard to evolve APIs without breaking changes
   - No abstraction layer for cross-process services

5. **No Plugin System**
   - Can't extend functionality without core changes
   - No isolation between features
   - Difficult for community contributions

---

## Phase 1: Foundation (Low Risk, High Value)

### 1.1: Add Version Support to Service Container

**Goal**: Enable semantic versioning for service APIs without breaking existing code.

**Changes**:
```typescript
// src/services/Container.ts
interface ServiceDefinition<T = any> {
  factory: ServiceFactory<T>;
  dependencies?: string[];
  singleton?: boolean;
  version?: string; // NEW: Semantic version (e.g., "1.2.0")
}

// Register with versions
container.register('block-renderer', {
  version: '1.0.0',
  factory: async () => new BlockRenderer()
});

// Consume with version range
container.resolve('block-renderer', '^1.0.0');
```

**Benefits**:
- Backwards compatible (version is optional)
- Enables future multi-version support
- Documents API stability

**Files to modify**:
- `src/services/Container.ts` (add version field, ~20 lines)
- `src/services/ServiceRegistry.ts` (add versions to registrations)

**Estimated effort**: 2-3 hours

---

### 1.2: Type-Safe IPC Router

**Goal**: Centralize IPC handler registration with type safety.

**Current state**:
```typescript
// src/main.ts (scattered throughout)
ipcMain.handle('profiles:list', () => { ... });
ipcMain.handle('profiles:create', (_, payload) => { ... });
ipcMain.on('slash-command:start', () => { ... });
// ... 30+ more handlers
```

**Proposed**:
```typescript
// src/ipc/IPCRouter.ts (NEW FILE)
export class IPCRouter {
  private handlers = new Map<string, IPCHandler>();

  register(channel: string, handler: IPCHandler) {
    this.handlers.set(channel, handler);

    if (handler.type === 'invoke') {
      ipcMain.handle(channel, handler.fn);
    } else {
      ipcMain.on(channel, handler.fn);
    }
  }

  registerNamespace(namespace: string, handlers: IPCHandlerMap) {
    // Register multiple related handlers
    // e.g., 'profiles:list', 'profiles:create', 'profiles:delete'
  }

  listChannels(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// src/ipc/handlers/ProfileHandlers.ts (NEW FILE)
export const profileHandlers: IPCHandlerMap = {
  'profiles:list': {
    type: 'invoke',
    fn: async () => container.get<ProfileManager>('profileManager').listProfiles()
  },
  'profiles:create': {
    type: 'invoke',
    fn: async (_, payload) => container.get<ProfileManager>('profileManager').create(payload)
  },
  // ...
};
```

**Benefits**:
- Single source of truth for IPC channels
- Can generate TypeScript types for preload automatically
- Easy to document and discover available channels
- Centralized error handling and logging
- Can add middleware (auth, rate limiting, etc.)

**Files to create**:
- `src/ipc/IPCRouter.ts` (~150 lines)
- `src/ipc/handlers/ProfileHandlers.ts` (~50 lines)
- `src/ipc/handlers/DocumentHandlers.ts` (~100 lines)
- `src/ipc/handlers/BrowserHandlers.ts` (~80 lines)
- `src/ipc/handlers/BlockHandlers.ts` (~60 lines)

**Files to modify**:
- `src/main.ts` (replace inline handlers, ~-200 lines, +20 lines)

**Estimated effort**: 6-8 hours

---

### 1.3: IPC Service Discovery

**Goal**: Allow services to expose themselves across process boundaries automatically.

**Concept**:
```typescript
// src/services/IPCServiceBridge.ts (NEW FILE)
export class IPCServiceBridge {
  constructor(private router: IPCRouter, private container: Container) {}

  exposeService(serviceName: string, methods: string[], namespace?: string) {
    const service = this.container.get(serviceName);
    const channelPrefix = namespace || serviceName;

    methods.forEach(method => {
      const channel = `${channelPrefix}:${method}`;
      this.router.register(channel, {
        type: 'invoke',
        fn: async (_, ...args) => service[method](...args)
      });
    });
  }
}

// Usage in ServiceRegistry.ts
const bridge = new IPCServiceBridge(router, container);
bridge.exposeService('profileManager', ['list', 'create', 'delete'], 'profiles');
bridge.exposeService('documentManager', ['getActive', 'getTree', 'create', 'rename', 'delete', 'move', 'switch'], 'documents');
```

**Benefits**:
- Services automatically available across IPC
- Reduces boilerplate in main.ts
- Services don't need to know about IPC
- Can add versioning info to exposed methods

**Files to create**:
- `src/services/IPCServiceBridge.ts` (~100 lines)

**Files to modify**:
- `src/main.ts` (use bridge for service exposure)
- `src/services/ServiceRegistry.ts` (declare which services are IPC-exposed)

**Estimated effort**: 4-5 hours

---

## Phase 2: Dynamic Block Registration (Medium Risk, High Value)

### 2.1: Block Registry Service

**Goal**: Enable runtime registration of custom block types.

**Current state**:
```typescript
// src/types/schema.ts (STATIC)
export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    site: site(),
    [GoogleSearchExtensionName]: GoogleSearch(),
    [ChatGPTExtensionName]: ChatGPT(),
    [URLExtensionName]: URL(),
  },
});
```

**Proposed**:
```typescript
// src/services/BlockRegistry.ts (NEW FILE)
export class BlockRegistry {
  private blocks = new Map<string, BlockRegistration>();
  private schema: BlockNoteSchema | null = null;

  register(registration: BlockRegistration): void {
    this.blocks.set(registration.type, registration);
    this.invalidateSchema();
  }

  unregister(type: string): void {
    this.blocks.delete(type);
    this.invalidateSchema();
  }

  getSchema(): BlockNoteSchema {
    if (!this.schema) {
      this.schema = this.buildSchema();
    }
    return this.schema;
  }

  private buildSchema(): BlockNoteSchema {
    const blockSpecs = { ...defaultBlockSpecs };

    for (const [type, registration] of this.blocks) {
      blockSpecs[type] = registration.spec();
    }

    return BlockNoteSchema.create({ blockSpecs });
  }

  private invalidateSchema(): void {
    this.schema = null;
  }
}

interface BlockRegistration {
  type: string;
  version: string; // Semantic version
  spec: () => BlockSpec;
  category: string; // For slash command grouping
  aliases?: string[];
  metadata?: {
    title: string;
    description: string;
    icon?: string;
  };
}
```

**Usage**:
```typescript
// Core blocks register themselves
blockRegistry.register({
  type: 'google-search',
  version: '1.0.0',
  spec: GoogleSearch,
  category: 'Media',
  aliases: ['g', 'google', 'search'],
  metadata: {
    title: 'Google Search',
    description: 'Search Google and view results'
  }
});

// Third-party plugin could do:
blockRegistry.register({
  type: 'youtube-embed',
  version: '1.0.0',
  spec: YouTubeBlock,
  category: 'Media',
  aliases: ['yt', 'youtube'],
  metadata: {
    title: 'YouTube',
    description: 'Embed YouTube videos'
  }
});
```

**Benefits**:
- Blocks can be added/removed at runtime
- Opens door for plugin system
- Slash command options auto-generated from registry
- Better separation of concerns

**Files to create**:
- `src/services/BlockRegistry.ts` (~200 lines)
- `src/types/blockRegistration.ts` (~50 lines)

**Files to modify**:
- `src/types/schema.ts` (use BlockRegistry instead of static schema)
- `src/data/slashCommandOptions.ts` (generate from BlockRegistry)
- Individual block files (register themselves on import)

**Estimated effort**: 8-12 hours

**Risk**: Medium - changes core editor initialization

---

### 2.2: Decouple Slash Commands from Block Types

**Goal**: Slash commands should be generated from block registry metadata.

**Current**: `slashCommandOptions` is a hardcoded array in `src/data/slashCommandOptions.ts`

**Proposed**:
```typescript
// src/hooks/useSlashCommandBridge.tsx
const slashCommandOptions = useMemo(() => {
  const registry = container.get<BlockRegistry>('blockRegistry');
  return registry.getSlashCommandOptions(); // Generated from block metadata
}, []);
```

**Benefits**:
- Single source of truth
- Block registration automatically updates slash commands
- Easier to keep metadata in sync

**Files to modify**:
- `src/data/slashCommandOptions.ts` (convert to generated data)
- `src/hooks/useSlashCommandBridge.tsx` (use registry)

**Estimated effort**: 3-4 hours

---

## Phase 3: Plugin System Foundation (High Risk, High Value)

### 3.1: Plugin Manifest Format

**Goal**: Define standard format for Digest plugins.

**Proposed structure**:
```
~/.digest/plugins/
  youtube-embed/
    package.json          # NPM-compatible with Digest extensions
    plugin.json           # Digest-specific metadata
    index.js              # Entry point
    blocks/
      YouTubeBlock.tsx
    services/
      YouTubeService.ts
```

**plugin.json format**:
```json
{
  "id": "com.example.youtube-embed",
  "name": "YouTube Embed",
  "version": "1.2.0",
  "digestVersion": "^0.1.0",
  "description": "Embed YouTube videos in Digest",
  "author": "Example Corp",
  "main": "index.js",

  "providedServices": {
    "video-player": {
      "description": "Provides video playback capabilities",
      "versions": {
        "1.0.0": "provideVideoPlayer"
      }
    }
  },

  "consumedServices": {
    "block-registry": {
      "versions": "^1.0.0",
      "required": true
    },
    "database": {
      "versions": "^1.0.0",
      "required": false
    }
  },

  "blocks": [
    {
      "type": "youtube",
      "category": "Media",
      "title": "YouTube Video",
      "description": "Embed a YouTube video"
    }
  ],

  "permissions": [
    "network",      // Can make network requests
    "storage",      // Can access plugin storage
    "clipboard"     // Can access clipboard
  ]
}
```

**Files to create**:
- `src/types/plugin.ts` (~100 lines - type definitions)
- `docs/plugin-development.md` (documentation)

**Estimated effort**: 2-3 hours

---

### 3.2: Plugin Loader Service

**Goal**: Load, validate, and initialize plugins.

**Implementation**:
```typescript
// src/services/PluginLoader.ts (NEW FILE)
export class PluginLoader {
  private plugins = new Map<string, Plugin>();
  private pluginPath: string;

  constructor(
    private container: Container,
    private serviceHub: ServiceHub
  ) {
    this.pluginPath = path.join(app.getPath('userData'), 'plugins');
  }

  async loadAll(): Promise<void> {
    const pluginDirs = await this.scanPluginDirectory();

    for (const dir of pluginDirs) {
      try {
        await this.loadPlugin(dir);
      } catch (error) {
        log.error(`Failed to load plugin from ${dir}:`, error);
      }
    }
  }

  async loadPlugin(pluginDir: string): Promise<void> {
    // 1. Read and validate plugin.json
    const manifest = await this.loadManifest(pluginDir);
    this.validateManifest(manifest);

    // 2. Check version compatibility
    if (!this.isCompatible(manifest.digestVersion)) {
      throw new Error(`Plugin ${manifest.id} requires Digest ${manifest.digestVersion}`);
    }

    // 3. Verify dependencies (consumed services)
    for (const [serviceName, spec] of Object.entries(manifest.consumedServices)) {
      if (!this.serviceHub.hasCompatibleService(serviceName, spec.versions)) {
        if (spec.required) {
          throw new Error(`Plugin ${manifest.id} requires service ${serviceName}@${spec.versions}`);
        }
      }
    }

    // 4. Create sandbox context for plugin
    const sandbox = this.createSandbox(manifest);

    // 5. Load main file
    const mainPath = path.join(pluginDir, manifest.main);
    const pluginModule = require(mainPath);

    // 6. Initialize plugin
    const plugin = await pluginModule.activate(sandbox);

    // 7. Register provided services
    for (const [serviceName, spec] of Object.entries(manifest.providedServices)) {
      for (const [version, method] of Object.entries(spec.versions)) {
        this.serviceHub.provide(serviceName, version, plugin[method]());
      }
    }

    this.plugins.set(manifest.id, {
      manifest,
      instance: plugin,
      sandbox
    });

    log.info(`Loaded plugin: ${manifest.name} v${manifest.version}`);
  }

  private createSandbox(manifest: PluginManifest): PluginAPI {
    // Expose limited API to plugin based on permissions
    return {
      blockRegistry: manifest.consumedServices['block-registry']
        ? this.serviceHub.consume('block-registry', manifest.consumedServices['block-registry'].versions)
        : null,

      storage: manifest.permissions.includes('storage')
        ? this.createPluginStorage(manifest.id)
        : null,

      // etc.
    };
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (plugin?.instance.deactivate) {
      await plugin.instance.deactivate();
    }
    this.plugins.delete(pluginId);
  }
}
```

**Files to create**:
- `src/services/PluginLoader.ts` (~300 lines)
- `src/services/PluginSandbox.ts` (~150 lines)
- `src/types/plugin.ts` (extend with runtime types)

**Files to modify**:
- `src/main.ts` (initialize plugin loader after services)

**Estimated effort**: 12-16 hours

**Risk**: High - introduces external code execution, needs security review

---

### 3.3: Service Hub with Versioning

**Goal**: Atom-style service provider/consumer system.

**Implementation**:
```typescript
// src/services/ServiceHub.ts (NEW FILE)
export class ServiceHub {
  private providers = new Map<string, Map<string, any>>();
  private consumers = new Map<string, ServiceConsumer[]>();

  provide(serviceName: string, version: string, implementation: any): void {
    if (!this.providers.has(serviceName)) {
      this.providers.set(serviceName, new Map());
    }

    this.providers.get(serviceName)!.set(version, implementation);

    // Notify waiting consumers
    this.matchConsumers(serviceName);
  }

  consume(
    serviceName: string,
    versionRange: string,
    callback?: (service: any) => void
  ): any {
    const service = this.findCompatibleService(serviceName, versionRange);

    if (service) {
      if (callback) callback(service);
      return service;
    }

    // Service not available yet, queue consumer
    if (callback) {
      this.queueConsumer(serviceName, versionRange, callback);
    }

    return null;
  }

  hasCompatibleService(serviceName: string, versionRange: string): boolean {
    return this.findCompatibleService(serviceName, versionRange) !== null;
  }

  private findCompatibleService(serviceName: string, versionRange: string): any {
    const versions = this.providers.get(serviceName);
    if (!versions) return null;

    // Find highest compatible version using semver
    const compatibleVersions = Array.from(versions.keys())
      .filter(v => semver.satisfies(v, versionRange))
      .sort(semver.rcompare);

    return compatibleVersions.length > 0
      ? versions.get(compatibleVersions[0])
      : null;
  }

  private matchConsumers(serviceName: string): void {
    const consumers = this.consumers.get(serviceName) || [];

    for (const consumer of consumers) {
      const service = this.findCompatibleService(serviceName, consumer.versionRange);
      if (service) {
        consumer.callback(service);
      }
    }

    // Remove satisfied consumers
    this.consumers.set(
      serviceName,
      consumers.filter(c => !this.findCompatibleService(serviceName, c.versionRange))
    );
  }

  private queueConsumer(
    serviceName: string,
    versionRange: string,
    callback: (service: any) => void
  ): void {
    if (!this.consumers.has(serviceName)) {
      this.consumers.set(serviceName, []);
    }
    this.consumers.get(serviceName)!.push({ versionRange, callback });
  }
}

interface ServiceConsumer {
  versionRange: string;
  callback: (service: any) => void;
}
```

**Integration with existing Container**:
```typescript
// Container and ServiceHub work together:
// - Container: Internal services with hard dependencies
// - ServiceHub: Cross-plugin services with version negotiation

container.register('serviceHub', {
  factory: () => new ServiceHub()
});

// Core services expose themselves through ServiceHub
const serviceHub = container.get<ServiceHub>('serviceHub');
serviceHub.provide('block-registry', '1.0.0', container.get('blockRegistry'));
serviceHub.provide('database', '1.0.0', container.get('database'));
```

**Files to create**:
- `src/services/ServiceHub.ts` (~250 lines)

**Files to modify**:
- `src/services/ServiceRegistry.ts` (expose core services to ServiceHub)
- `package.json` (add `semver` dependency)

**Estimated effort**: 8-10 hours

---

## Phase 4: Advanced Features (Future)

### 4.1: Plugin UI Extensions

Allow plugins to add:
- Menu items
- Toolbar buttons
- Settings panels
- Custom overlays

### 4.2: IPC Service Bridge for Plugins

Allow plugins in renderer process to communicate with main process services through versioned IPC.

### 4.3: Plugin Marketplace

- Plugin discovery
- Installation/update UI
- Version management
- Ratings and reviews

### 4.4: Hot Reload

Support plugin development with hot reload (similar to VS Code extension development).

---

## Migration Strategy

### Backwards Compatibility

All phases maintain backwards compatibility:
- Phase 1: Adds optional features to existing services
- Phase 2: Existing blocks continue to work, gradually migrate to registry
- Phase 3: Plugins are opt-in, core functionality unchanged

### Rollout Plan

1. **Week 1-2**: Phase 1 (Foundation)
   - Low risk, immediate benefits
   - Better code organization
   - Easier maintenance

2. **Week 3-4**: Phase 2 (Dynamic Blocks)
   - Medium risk, validate thoroughly
   - Keep existing schema as fallback
   - Gradual migration of blocks

3. **Week 5-8**: Phase 3 (Plugin System)
   - High risk, extensive testing needed
   - Internal plugins first (dogfooding)
   - Security audit before public plugins

4. **Month 3+**: Phase 4 (Advanced Features)
   - Build on proven foundation
   - Community feedback drives priorities

---

## Success Metrics

### Phase 1
- [ ] All services have version annotations
- [ ] IPC channels documented and typed
- [ ] Zero regression in functionality
- [ ] Code coverage maintained

### Phase 2
- [ ] Can add new block type without modifying schema.ts
- [ ] Slash commands auto-generated from registry
- [ ] Performance parity with static registration

### Phase 3
- [ ] Successfully load external plugin from disk
- [ ] Plugin can register custom block type
- [ ] Plugin can consume core services
- [ ] Sandbox prevents unauthorized access
- [ ] At least 2 example plugins working

### Phase 4
- [ ] Community plugins available
- [ ] Plugin development documentation
- [ ] Active plugin ecosystem

---

## Security Considerations

### Plugin Sandboxing

Plugins run in isolated context with:
- Limited Node.js API access
- Explicit permission system
- No direct file system access (except plugin storage)
- No arbitrary IPC sending
- Rate limiting on service calls

### Permission System

```typescript
enum PluginPermission {
  NETWORK = 'network',           // HTTP requests
  STORAGE = 'storage',           // Plugin-specific storage
  CLIPBOARD = 'clipboard',       // Read/write clipboard
  SHELL = 'shell',              // Execute shell commands (dangerous!)
  DATABASE = 'database',         // Direct DB access
  IPC = 'ipc',                  // Custom IPC channels
}
```

Dangerous permissions (SHELL, DATABASE) require:
- User confirmation
- Code signing (future)
- Audit trail

### Code Signing (Future)

- Trusted plugin developers sign plugins
- Digest verifies signatures
- Unsigned plugins show warning
- Enterprise: Only signed plugins allowed

---

## Key Architectural Insights from Atom

### What Atom Got Right

1. **Semantic Versioning Everywhere**
   - APIs can evolve safely
   - Multiple versions coexist
   - Graceful degradation

2. **Services as Contracts**
   - Provider/consumer decoupling
   - Discovery instead of import
   - Cross-package communication

3. **Everything is a Package**
   - Even core features are packages
   - Forces good API design
   - Enables selective loading

4. **Minimal Core**
   - Core provides infrastructure
   - Features live in packages
   - Easier to maintain and test

### What We Should Do Differently

1. **Type Safety**
   - Atom used CoffeeScript, we use TypeScript
   - Leverage type system for service contracts
   - Generate types from manifests

2. **Multi-Process Architecture**
   - Atom was single-process
   - We need services across IPC boundaries
   - Service hub must work cross-process

3. **Security First**
   - Atom ran in browser context
   - We're Electron with Node.js access
   - Must sandbox plugins from day one

4. **Performance**
   - Plugin loading shouldn't block startup
   - Lazy load plugins when needed
   - Monitor plugin CPU/memory usage

---

## Open Questions

1. **Plugin Language Support**
   - JavaScript only? Or allow native modules?
   - TypeScript support? (compile on install?)
   - WASM plugins for performance?

2. **Plugin Communication**
   - Can plugins talk to each other?
   - Through service hub only?
   - Direct imports allowed?

3. **Plugin Lifecycle**
   - Can plugins be loaded/unloaded at runtime?
   - What happens to their blocks if unloaded?
   - Migration path for plugin updates?

4. **Distribution**
   - NPM registry? Custom registry?
   - Local development plugins?
   - Enterprise plugin repositories?

5. **Renderer Process Plugins**
   - Current plan focuses on main process
   - Should plugins have renderer components?
   - How do they integrate with React?

---

## Conclusion

This plan provides an incremental path from Digest's current architecture to a fully extensible, plugin-based system inspired by Atom's forward-thinking design.

**Key principles**:
- ✅ Backwards compatible at every step
- ✅ Low-risk changes first
- ✅ Type-safe by default
- ✅ Security-first design
- ✅ Performance conscious
- ✅ Well-documented

The result will be an architecture that:
- Allows community contributions without modifying core
- Enables experimentation with new block types
- Provides stable APIs that can evolve safely
- Maintains Digest's performance and security
- Scales to hundreds of plugins

Start with Phase 1 to get immediate benefits with minimal risk, then proceed to later phases based on community demand and development resources.
