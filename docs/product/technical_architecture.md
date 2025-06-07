# Digest Technical Architecture

This document outlines the technical architecture of the Digest application, focusing on current structure and proposed changes to support the roadmap.

## Current Architecture

Digest appears to be an Electron-based application with the following components:

- **Electron Main Process**: Manages the application lifecycle and native functionality
- **Renderer Process**: Handles the UI and user interactions
- **App Overlay**: Likely provides UI elements that overlay on top of other content
- **BlockNote Integration**: Rich text editor component with floating editor functionality

## Proposed Architecture Changes

### 1. Data Persistence Layer

```
┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │
│  Application    │◄────►│  SQLite Storage │
│                 │      │                 │
└─────────────────┘      └─────────────────┘
```

- **SQLite Database**: Local storage for notes and application state
- **Data Models**:
  - Blocks (content, type, metadata)
  - Pages/Documents
  - User preferences
- **Persistence Service**: Handles CRUD operations and data migrations

### 2. UI Component Architecture

```
┌─────────────────────────────────────────┐
│ Application Window                      │
│ ┌─────────────────┐ ┌─────────────────┐ │
│ │                 │ │                 │ │
│ │  Web Browser    │ │  Note Blocks    │ │
│ │  Components     │ │                 │ │
│ │                 │ │                 │ │
│ └─────────────────┘ └─────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │           Heads-Up Display          │ │
│ │ ┌─────────────┐    ┌─────────────┐  │ │
│ │ │ Block       │    │ Formatting  │  │ │
│ │ │ Selector    │    │ Controls    │  │ │
│ │ └─────────────┘    └─────────────┘  │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

- **Layer Management**: Ensure proper z-index handling for overlapping components
- **Heads-Up Display**: Consolidated control panel for block selection and formatting
- **Event Forwarding**: System for passing events between layers (e.g., scrolling)

### 3. Agent Integration Architecture

```
┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │
│  Digest App     │◄────►│  Claude API     │
│                 │      │                 │
└────────┬────────┘      └─────────────────┘
         │
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │
│  MCP Store      │◄────►│  External APIs  │
│                 │      │  (Jira, Git)    │
└─────────────────┘      └─────────────────┘
```

- **Claude Integration**:
  - API client for Claude
  - Context gathering from notes
  - Response rendering in UI
- **MCP Store**:
  - Adapter pattern for external integrations
  - Standardized interface for different services
  - Conversation history and context management

### 4. Search Architecture

```
┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │
│  Search UI      │◄────►│  Search Engine  │
│                 │      │                 │
└─────────────────┘      └────────┬────────┘
                                  │
                         ┌────────┴────────┐
                         │                 │
                         │  SQLite         │
                         │  (FTS + Vector) │
                         │                 │
                         └─────────────────┘
```

- **Full-Text Search**: Using SQLite FTS5 extension
- **Vector Search** (future):
  - Embedding generation
  - Vector storage in SQLite
  - Similarity search implementation

## Technical Considerations

### Event Handling
- Implement custom event bus for cross-layer communication
- Use IPC for communication between Electron processes
- **Critical**: See `functional_constraints.md` for detailed event coordination requirements
- **Current Issue**: Slash command (`/`) opens BlockNote suggestion menu but doesn't trigger HUD overlay

### Performance
- Optimize rendering for large documents
- Implement virtualization for long lists of blocks
- Lazy-load embedded web content

### Security
- Sandbox embedded web content
- Validate and sanitize content from external sources
- Secure storage of API keys and credentials

### Testing
- Unit tests for core functionality
- Integration tests for UI components
- End-to-end tests for critical user flows

## Technology Stack

- **Frontend**: Electron, React, TypeScript
- **Styling**: Mantine UI framework
- **Editor**: BlockNote
- **Storage**: SQLite
- **AI Integration**: Claude API
- **Build Tools**: Vite, Electron Forge 