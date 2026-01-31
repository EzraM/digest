/**
 * Text Extractor
 *
 * Extracts searchable text from blocks based on their manifests.
 * Handles various content types: inline content, nested blocks, props.
 */

import type { Block, BlockSearchManifest, SearchableBlock, SearchableField } from '../../blocks/core/types';
import { manifestRegistry } from './manifests';

// ============================================================================
// Inline Content Types (BlockNote-specific)
// ============================================================================

interface InlineText {
  type: 'text';
  text: string;
  styles?: Record<string, unknown>;
}

interface InlineLink {
  type: 'link';
  href: string;
  content: InlineContent[];
}

type InlineContent = InlineText | InlineLink | { type: string; content?: InlineContent[]; text?: string };

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Get a nested value from an object using a dot-notation path
 * Supports array access with [] notation
 */
function getByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;

    // Handle array notation like "children[]"
    if (part.endsWith('[]')) {
      const key = part.slice(0, -2);
      const arr = (current as Record<string, unknown>)[key];
      if (!Array.isArray(arr)) return undefined;
      // Return the array for further processing
      current = arr;
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

// ============================================================================
// Content Extraction
// ============================================================================

/**
 * Extract text from BlockNote inline content
 */
function extractFromInlineContent(content: unknown): string {
  if (!content) return '';

  // Handle array of inline content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          const inlineItem = item as InlineContent;
          // Text node
          if (inlineItem.type === 'text' && 'text' in inlineItem) {
            return inlineItem.text || '';
          }
          // Link or other node with nested content
          if ('content' in inlineItem && Array.isArray(inlineItem.content)) {
            return extractFromInlineContent(inlineItem.content);
          }
          // Fallback: check for text property
          if ('text' in inlineItem && typeof inlineItem.text === 'string') {
            return inlineItem.text;
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('');
  }

  // Handle string directly
  if (typeof content === 'string') return content;

  return '';
}

/**
 * Extract text from a block's children recursively
 */
function extractFromChildren(children: unknown): string {
  if (!Array.isArray(children)) return '';

  return children
    .map((child) => {
      if (typeof child === 'object' && child !== null) {
        return extractTextFromBlock(child as Block);
      }
      return '';
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Extract text based on a searchable field definition
 */
function extractField(block: Block, field: SearchableField): string {
  const { path, fieldType } = field;

  // Special handling for 'content' - it's inline content
  if (path === 'content') {
    return extractFromInlineContent(block.content);
  }

  // Special handling for 'children' - recursive block extraction
  if (path === 'children' || path.startsWith('children')) {
    return extractFromChildren(block.children);
  }

  // Get value by path
  const value = getByPath(block, path);

  if (value === undefined || value === null) return '';

  // Handle different value types
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    // Could be inline content or array of values
    if (value.length > 0 && typeof value[0] === 'object') {
      return extractFromInlineContent(value);
    }
    return value.filter((v) => typeof v === 'string').join(' ');
  }

  if (typeof value === 'object') {
    return extractFromInlineContent(value);
  }

  return String(value);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Extract all searchable text from a block
 * Uses the block's manifest to determine what to extract
 */
export function extractTextFromBlock(block: Block): string {
  const manifest = manifestRegistry.get(block.type);

  if (!manifest) {
    // No manifest = not searchable, but try basic content extraction
    const texts: string[] = [];

    // Try to extract inline content
    if (block.content) {
      texts.push(extractFromInlineContent(block.content));
    }

    // Try to extract from children
    if (block.children) {
      texts.push(extractFromChildren(block.children));
    }

    return texts.filter(Boolean).join(' ').trim();
  }

  // Extract using manifest fields
  const texts: string[] = [];

  for (const field of manifest.searchableFields) {
    const text = extractField(block, field);
    if (text) {
      texts.push(text);
    }
  }

  return texts.filter(Boolean).join(' ').trim();
}

/**
 * Extract weighted text segments from a block
 * Returns segments with their weights for ranking
 */
export function extractWeightedText(block: Block): Array<{ text: string; weight: number }> {
  const manifest = manifestRegistry.get(block.type);

  if (!manifest) {
    const text = extractTextFromBlock(block);
    return text ? [{ text, weight: 1.0 }] : [];
  }

  const segments: Array<{ text: string; weight: number }> = [];

  for (const field of manifest.searchableFields) {
    const text = extractField(block, field);
    if (text) {
      segments.push({
        text,
        weight: field.weight * (manifest.searchWeight ?? 1.0),
      });
    }
  }

  return segments;
}

/**
 * Convert a block to a SearchableBlock for indexing
 */
export function toSearchableBlock(
  block: Block,
  documentId: string
): SearchableBlock | null {
  const manifest = manifestRegistry.get(block.type);

  // If no manifest, check if block has any content worth indexing
  const textContent = extractTextFromBlock(block);

  // Skip blocks with no searchable content
  if (!textContent || textContent.length < 2) {
    return null;
  }

  return {
    blockId: block.id,
    documentId,
    blockType: block.type,
    textContent,
    metadata: {
      hasManifest: !!manifest,
      searchWeight: manifest?.searchWeight ?? 1.0,
      props: block.props ?? {},
    },
    updatedAt: Date.now(),
  };
}

/**
 * Extract all searchable blocks from a document
 * Flattens nested blocks and returns indexable content
 */
export function extractSearchableBlocks(
  blocks: Block[],
  documentId: string
): SearchableBlock[] {
  const result: SearchableBlock[] = [];

  function processBlock(block: Block): void {
    const searchable = toSearchableBlock(block, documentId);
    if (searchable) {
      result.push(searchable);
    }

    // Process children recursively
    if (block.children && Array.isArray(block.children)) {
      for (const child of block.children) {
        processBlock(child as Block);
      }
    }
  }

  for (const block of blocks) {
    processBlock(block);
  }

  return result;
}
