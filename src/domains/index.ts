// Domain Exports
//
// Each domain is self-contained with:
//   core/      - Pure types and interfaces
//   services/  - Implementations
//   hooks/     - React hooks (renderer-side)
//
// Import from specific domains:
//   import { BlockOperation } from '@/domains/blocks';
//   import { ViewWorld } from '@/domains/browser-views';

export * as blocks from './blocks';
export * as browserViews from './browser-views';
export * as clip from './clip';
export * as search from './search';

// Future domains (stubs):
// export * as documents from './documents';
// export * as workspace from './workspace';
