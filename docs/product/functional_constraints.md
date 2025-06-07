# Digest Functional Constraints & Requirements

This document captures the unique architectural constraints that must be considered when developing new features for Digest.

## Core Architectural Constraints

### Multi-WebContents Architecture

Digest uses a complex multi-WebContents architecture that creates unique coordination challenges:

```
┌─────────────────────────────────────────────────────────────┐
│ Electron Main Process                                       │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Main Renderer   │  │ HUD WebContents │  │ Browser     │ │
│  │ (BlockNote)     │  │ (Block Selector)│  │ Blocks      │ │
│  │                 │  │                 │  │ (Multiple)  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│           │                      │                 │       │
│           └──────────────────────┼─────────────────┘       │
│                                  │                         │
│                            IPC Event Bus                   │
└─────────────────────────────────────────────────────────────┘
```

**Key Constraint**: Every user interaction that spans multiple contexts requires careful IPC event coordination.

## Critical Functional Requirements

### 1. Heads-Up Display (HUD) Coordination

**Requirement**: The HUD must appear whenever a user action requires block selection or formatting controls.

**Current Issue**: Slash command (`/`) opens BlockNote's suggestion menu but doesn't trigger the HUD WebContents overlay.

**Constraint**: 
- HUD is a separate WebContents instance with its own render process
- Events must be forwarded from main renderer → main process → HUD WebContents
- Event timing is critical - HUD must appear synchronously with user actions

**Implementation Rule**: Any feature that involves block manipulation MUST include HUD coordination logic.

### 2. Event Forwarding Chain

**Required Pattern** for all user interactions:
```
User Action → Main Renderer → IPC to Main Process → IPC to HUD → UI Update
     ↓
  Potential failure points:
  - Event not sent to main process
  - Main process doesn't forward to HUD  
  - HUD doesn't respond to event
  - Timing issues cause visual glitches
```

**Constraint**: Every event in this chain must be:
- Properly debounced/throttled
- Include error handling for missing WebContents
- Have fallback behavior if HUD is unavailable

### 3. State Synchronization

**Requirement**: Multiple WebContents instances must maintain consistent state.

**Critical State Items**:
- Current block selection
- Editor focus state
- Active formatting options
- Block type selection
- Browser block positions and URLs

**Constraint**: State changes in ANY WebContents must be propagated to ALL relevant contexts.

### 4. Focus Management

**Requirement**: Seamless focus transitions between contexts.

**Critical Scenarios**:
- User types `/` in editor → HUD appears → user selects block type → focus returns to editor
- User clicks browser block → browser gets focus → user presses Esc → editor regains focus
- HUD is visible → user clicks editor → HUD disappears, editor gets focus

**Constraint**: Focus transitions must feel instantaneous to the user despite crossing process boundaries.

## Development Guidelines

### Before Adding Any Feature

**Always Ask:**
1. Does this feature cross WebContents boundaries?
2. What events need to be coordinated between processes?
3. How does this affect the HUD display logic?
4. What happens if a WebContents instance is unavailable?
5. How do we maintain state consistency?

### Required IPC Event Planning

For any new feature, document:
```
Feature: [Name]
Trigger: [User action]
Event Chain:
  1. [Initial context] → [Event name] → [Target context]
  2. [Response context] → [Response event] → [Final context]
Fallback Behavior: [What happens if chain breaks]
State Changes: [What state needs to sync across contexts]
```

### Testing Requirements

Every feature MUST be tested with:
- Multiple WebContents instances active
- WebContents instances being created/destroyed during operation
- Network latency simulation (for event timing)
- Focus switching scenarios

## Common Pitfalls to Avoid

### 1. Assuming Synchronous Cross-Process Communication
❌ **Wrong**: Expecting immediate response from HUD after sending IPC event  
✅ **Right**: Using callback/promise patterns for cross-process coordination

### 2. Not Handling Missing WebContents
❌ **Wrong**: Sending IPC events without checking if target exists  
✅ **Right**: Always verify WebContents availability before sending events

### 3. Creating Event Loops
❌ **Wrong**: Event A triggers Event B which triggers Event A  
✅ **Right**: Use event flags and debouncing to prevent loops

### 4. Ignoring HUD in Feature Design
❌ **Wrong**: Building features that only work in main renderer  
✅ **Right**: Designing features with HUD integration from the start

## Quick Reference: When to Update This Document

Update this document whenever:
- Adding new WebContents instances
- Creating new IPC event types
- Modifying the event coordination logic
- Discovering new edge cases in multi-context scenarios
- Adding features that span multiple UI layers

## Emergency Debug Checklist

When multi-context features aren't working:
1. Check if all WebContents instances are created and available
2. Verify IPC events are being sent (check main process logs)
3. Confirm events are being received (check target WebContents logs)
4. Validate event timing isn't causing race conditions
5. Ensure state is properly synchronized across contexts
6. Test focus management transitions 