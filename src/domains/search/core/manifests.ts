/**
 * Block Search Manifests
 *
 * Declares which parts of each block type are searchable.
 * This is the contract between block definitions and the search system.
 */

import type { BlockSearchManifest, SearchableField } from '../../blocks/core/types';

// ============================================================================
// Built-in Block Manifests
// ============================================================================

/**
 * Standard text content field - used by paragraph, heading, list items, etc.
 */
const textContentField: SearchableField = {
  path: 'content',
  fieldType: 'text',
  weight: 1.0,
};

/**
 * URL field for browser/site blocks
 */
const urlField: SearchableField = {
  path: 'props.url',
  fieldType: 'url',
  weight: 0.8,
};

/**
 * Title field for titled blocks
 */
const titleField: SearchableField = {
  path: 'props.title',
  fieldType: 'text',
  weight: 1.2,
};

// Paragraph block manifest
export const paragraphManifest: BlockSearchManifest = {
  blockType: 'paragraph',
  searchableFields: [textContentField],
  searchWeight: 1.0,
};

// Heading block manifest (higher weight for headings)
export const headingManifest: BlockSearchManifest = {
  blockType: 'heading',
  searchableFields: [textContentField],
  searchWeight: 1.5,
};

// Bullet list item manifest
export const bulletListItemManifest: BlockSearchManifest = {
  blockType: 'bulletListItem',
  searchableFields: [textContentField],
  searchWeight: 0.9,
};

// Numbered list item manifest
export const numberedListItemManifest: BlockSearchManifest = {
  blockType: 'numberedListItem',
  searchableFields: [textContentField],
  searchWeight: 0.9,
};

// Check list item manifest
export const checkListItemManifest: BlockSearchManifest = {
  blockType: 'checkListItem',
  searchableFields: [textContentField],
  searchWeight: 0.9,
};

// Site/Browser block manifest
export const siteManifest: BlockSearchManifest = {
  blockType: 'site',
  searchableFields: [
    urlField,
    titleField,
    {
      path: 'props.description',
      fieldType: 'text',
      weight: 0.7,
    },
  ],
  searchWeight: 1.0,
};

// Clip block manifest (web clippings)
export const clipManifest: BlockSearchManifest = {
  blockType: 'clip',
  searchableFields: [
    {
      path: 'props.content',
      fieldType: 'text',
      weight: 1.0,
    },
    urlField,
    titleField,
    {
      path: 'props.sourceTitle',
      fieldType: 'text',
      weight: 0.8,
    },
  ],
  searchWeight: 1.1, // Slightly higher - clips are user-curated content
};

// Image block manifest
export const imageManifest: BlockSearchManifest = {
  blockType: 'image',
  searchableFields: [
    {
      path: 'props.caption',
      fieldType: 'text',
      weight: 1.0,
    },
    {
      path: 'props.name',
      fieldType: 'text',
      weight: 0.5,
    },
  ],
  searchWeight: 0.6, // Lower weight - primarily visual content
};

// Video block manifest
export const videoManifest: BlockSearchManifest = {
  blockType: 'video',
  searchableFields: [
    {
      path: 'props.caption',
      fieldType: 'text',
      weight: 1.0,
    },
    {
      path: 'props.name',
      fieldType: 'text',
      weight: 0.5,
    },
  ],
  searchWeight: 0.6,
};

// Audio block manifest
export const audioManifest: BlockSearchManifest = {
  blockType: 'audio',
  searchableFields: [
    {
      path: 'props.caption',
      fieldType: 'text',
      weight: 1.0,
    },
    {
      path: 'props.name',
      fieldType: 'text',
      weight: 0.5,
    },
  ],
  searchWeight: 0.6,
};

// File block manifest
export const fileManifest: BlockSearchManifest = {
  blockType: 'file',
  searchableFields: [
    {
      path: 'props.caption',
      fieldType: 'text',
      weight: 1.0,
    },
    {
      path: 'props.name',
      fieldType: 'text',
      weight: 0.8,
    },
  ],
  searchWeight: 0.7,
};

// Table block manifest
export const tableManifest: BlockSearchManifest = {
  blockType: 'table',
  searchableFields: [
    {
      path: 'children',
      fieldType: 'text',
      weight: 0.8,
    },
  ],
  searchWeight: 0.8,
  excludeFromSearch: ['props.colWidths'], // Don't index column width data
};

// ============================================================================
// Manifest Registry
// ============================================================================

/**
 * Registry of all block search manifests
 * Maps block type → manifest
 */
class ManifestRegistry {
  private manifests = new Map<string, BlockSearchManifest>();

  constructor() {
    // Register built-in manifests
    this.register(paragraphManifest);
    this.register(headingManifest);
    this.register(bulletListItemManifest);
    this.register(numberedListItemManifest);
    this.register(checkListItemManifest);
    this.register(siteManifest);
    this.register(clipManifest);
    this.register(imageManifest);
    this.register(videoManifest);
    this.register(audioManifest);
    this.register(fileManifest);
    this.register(tableManifest);
  }

  /**
   * Register a manifest for a block type
   */
  register(manifest: BlockSearchManifest): void {
    this.manifests.set(manifest.blockType, manifest);
  }

  /**
   * Get the manifest for a block type
   * Returns undefined if the block type is not searchable
   */
  get(blockType: string): BlockSearchManifest | undefined {
    return this.manifests.get(blockType);
  }

  /**
   * Check if a block type is searchable
   */
  isSearchable(blockType: string): boolean {
    return this.manifests.has(blockType);
  }

  /**
   * Get all registered block types
   */
  getSearchableTypes(): string[] {
    return Array.from(this.manifests.keys());
  }

  /**
   * Get all manifests
   */
  getAll(): BlockSearchManifest[] {
    return Array.from(this.manifests.values());
  }
}

/**
 * Singleton manifest registry instance
 */
export const manifestRegistry = new ManifestRegistry();

/**
 * Helper function to get manifest for a block type
 */
export function getManifest(blockType: string): BlockSearchManifest | undefined {
  return manifestRegistry.get(blockType);
}

/**
 * Helper function to check if a block type is searchable
 */
export function isBlockSearchable(blockType: string): boolean {
  return manifestRegistry.isSearchable(blockType);
}
