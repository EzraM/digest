# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Digest** is an Electron-based note-taking application that combines rich text editing with embedded web browsing capabilities. It uses a sophisticated multi-WebContents architecture where different UI components run in separate renderer processes.

## Commands

### Development
```bash
yarn start          # Start development server
yarn package        # Package application
yarn make           # Build for production
yarn lint           # Run ESLint
yarn clean          # Clean build artifacts
```

### Package Manager
- **Required**: Yarn 1.22.19 (specified in package.json)
- **Node.js**: TypeScript ES2022 target with CommonJS modules

## Architecture

### Multi-WebContents System
The application uses multiple WebContents instances that must be carefully coordinated:

```
┌─────────────────────────────────────────────────────────────┐
│ Electron Main Process                                       │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Main Renderer   │  │ HUD WebContents │  │ Prompt      │ │
│  │ (BlockNote)     │  │ (Block Selector)│  │ Overlay     │ │
│  │                 │  │                 │  │             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│           │                      │                 │       │
│           └──────────────────────┼─────────────────┘       │
│                                  │                         │
│                            IPC Event Bus                   │
└─────────────────────────────────────────────────────────────┘
```

### Critical Architectural Constraints

1. **Layer Management**: All WebContentsView additions must use ViewLayerManager to ensure proper z-ordering:
   - Background (0): Main app content
   - Browser Blocks (10): Embedded websites
   - Overlays (20): HUD overlays
   - Prompt (30): AI prompt overlay

2. **Event Coordination**: Every user interaction spanning multiple contexts requires IPC event coordination with proper error handling for missing WebContents.

3. **State Synchronization**: Critical state (block selection, focus, formatting) must sync across all WebContents instances.

## Key Services

### ViewLayerManager (`src/services/ViewLayerManager.ts`)
**Critical**: Always use this service for WebContentsView management. Never call `addChildView` directly.

### ViewManager (`src/services/ViewManager.ts`)
Manages browser block WebContentsViews lifecycle, URL loading, and link interception.

### BlockOperationService (`src/services/BlockOperationService.ts`)
Unified service for Y.js document operations and SQLite persistence with transaction support.

### IntelligentUrlService (`src/services/IntelligentUrlService.ts`)
Claude API integration for intelligent URL processing with cost tracking.

## Development Guidelines

### Before Adding Features
Always consider:
- Does this cross WebContents boundaries?
- What events need coordination between processes?
- How does this affect HUD display logic?
- What happens if a WebContents instance is unavailable?
- What layer should this WebContentsView be on?

### Required Event Pattern
```
User Action → Main Renderer → IPC to Main Process → IPC to Target WebContents → UI Update
```

### Focus Management
Key scenarios requiring seamless focus transitions:
- `/` in editor → HUD appears → block selection → focus returns to editor
- Browser block click → browser focus → Esc → editor regains focus
- HUD visible → editor click → HUD disappears, editor gets focus

## Core Technologies

- **Electron**: 30.1.0 (desktop framework)
- **React**: 18.3.1 with TypeScript
- **BlockNote**: 0.32.0 (rich text editor)
- **Y.js**: 13.6.10 (CRDT for collaborative editing)
- **Better SQLite3**: 9.2.2 (persistence)
- **Mantine**: UI components (overlays)
- **Vite**: 5.0.12 (build system)
- **RxJS**: 7.8.2 (reactive programming)

## Development Setup

1. Install dependencies: `yarn install`
2. Optional: Create `.env.local` with `BRAVE_SEARCH_API_KEY=your-key` for Brave web search in the workspace (no default; when missing, web search is disabled).
3. Start development: `yarn start`

### Enable DevTools
Edit `src/config/development.ts`:
```typescript
export const DEV_CONFIG = {
  devtools: {
    openMainWindow: true,      // BlockNote editor
    openHudOverlay: false,     // Block selection HUD
    openPromptOverlay: false,  // AI prompt overlay
    openBrowserViews: false,   // Browser blocks
  }
};
```

## Key File Locations

- **Main Process**: `src/main.ts`
- **Primary Renderer**: `src/renderer.tsx` (BlockNote editor)
- **HUD Overlay**: `app-overlay/app-overlay.tsx`
- **Prompt Overlay**: `prompt-overlay/prompt-overlay.tsx`
- **Browser Blocks**: `src/Browser/Browser.tsx`
- **Block Types**: `src/data/slashCommandOptions.ts`

## Testing Requirements

All features must be tested with:
- Multiple WebContents instances active
- WebContents instances being created/destroyed during operation
- Focus switching scenarios
- Event coordination across process boundaries

## Common Issues

1. **Event Loops**: Use flags and debouncing to prevent IPC event loops
2. **Missing WebContents**: Always verify WebContents availability before sending events
3. **Z-Order Issues**: Only use ViewLayerManager for WebContentsView management
4. **Focus Problems**: Test all focus transition scenarios thoroughly

## Current Known Issues

- Some blocks don't properly disappear when removed
- Race conditions in multi-context scenarios
- Bootstrap indexing not called on startup — existing blocks won't appear in workspace search until edited