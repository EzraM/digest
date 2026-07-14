# Digest Development Roadmap

This roadmap outlines the development priorities for the Digest project, organized by priority and estimated effort.

## Priority 1: Critical UI Fixes and Basic Persistence

### UI Fixes (High Priority, Medium Effort)
- [x] **Fix Block Removal**: Ensure blocks are properly removed when deleted
- [x] **Improve Add Block UI**:
  - [x] Make input full width
  - [x] Implement Mantine styling
  - [x] Add autofocus to input field



### Local Storage (High Priority, Medium Effort)
- [ ] **Implement SQLite Storage**:
  - [ ] Set up SQLite database schema
  - [ ] Create persistence layer
  - [ ] Add auto-save functionality
  - [ ] Implement load on startup

## Priority 2: Editor and Interaction Improvements

### Editor Enhancements (Medium Priority, Medium Effort)
- [x] **Rework Floating Editor**:
  - [x] Move to heads-up-display to bottom center
  - [x] Ensure compatibility with layered structure
  - [x] Fix dropdown menu styling issues

### Interaction Improvements (Medium Priority, Medium-High Effort)
- [ ] **Enhanced Scrolling**:
  - [ ] Implement event forwarding from webpage to app
  - [ ] Add smooth scrolling between content areas
- [ ] **Text Selection**:
  - [ ] Capture browser text selections
  - [ ] Create mechanism to move selected text to blocks

## Priority 3: Agent Integration

### Claude Integration (Medium Priority, High Effort)
- [ ] **Browser-based Claude Chat**:
  - [ ] Set up API integration
  - [ ] Create chat interface
  - [ ] Implement context gathering from notes
- [ ] **Question Block Implementation**:
  - [ ] Design and implement question block type
  - [ ] Connect to Claude API

### MCP Integration (Lower Priority, High Effort)
- [ ] **Explore MCP Store Pattern**:
  - [ ] Research Cline VS Code extension
  - [ ] Design integration architecture
- [ ] **External Tool Integration**:
  - [ ] Jira integration
  - [ ] Git integration

## Priority 4: Search Functionality

### Basic Search (Medium Priority, Medium Effort)
- [ ] **SQLite Text Search**:
  - [ ] Implement full-text search
  - [ ] Create search UI

### Advanced Search (Lower Priority, High Effort)
- [ ] **Embedding-based Search**:
  - [ ] Research embedding options
  - [ ] Implement vector storage in SQLite
  - [ ] Create semantic search functionality
- [ ] **Gemini Integration** (if needed)

## Priority 5: Backend Development

### Backend Server (Low Priority, Very High Effort)
- [ ] **Evaluate Backend Needs**:
  - [ ] Determine if a backend server is necessary
  - [ ] Research Rama as potential technology
  - [ ] Create proof of concept


## Philosophy

It's probably time to give a bit of guidance, or point of view, on when to make new blocks versus when to update. The name of the document editor is Digest. The idea behind Digest is that we want to compress and refine the information we get while exploring on the internet. Our understanding should become sharper and more dense as we put in more time. It's quality over quantity. We are training ourselves.

A curious and fastidious friend.