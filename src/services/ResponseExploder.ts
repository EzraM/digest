import { log } from "../utils/mainLogger";
import { CustomPartialBlock } from "../types/schema";

// We'll define our own types that match BlockNote's expected structure
// rather than importing the generic types that require complex type parameters

// BlockNote-compatible types
type BlockNoteStyledText = {
  type: "text";
  text: string;
  styles: Record<string, any>;
};

type BlockNoteLink = {
  type: "link";
  content: BlockNoteStyledText[];
  href: string;
};

type BlockNoteInlineContent = BlockNoteStyledText | BlockNoteLink;

// Block creation interfaces - now using our typed schema
export interface BlockCreationRequest {
  type: string;
  props?: Record<string, any>;
  content?: any;
  position?: "after" | "before" | "replace";
  blockId?: string; // For updating existing blocks
}

export interface ExplodedResponse {
  blocks: BlockCreationRequest[];
  metadata: {
    originalInput: string;
    processingTime: number;
    blockCount: number;
  };
}

// XML parsing result
interface ParsedXMLElement {
  tag: string;
  content: string;
  attributes: Record<string, string>;
}

/**
 * Service responsible for "exploding" Claude's XML responses into multiple BlockNote blocks
 * This allows Claude to respond with rich, structured content that gets converted into
 * appropriate block types (tables, paragraphs, headings, site blocks, etc.)
 */
export class ResponseExploder {
  /**
   * Main entry point: takes Claude's response and converts it to block creation requests
   */
  static explodeResponse(
    claudeResponse: string,
    originalInput: string
  ): ExplodedResponse {
    const startTime = Date.now();

    log.debug(
      `Exploding Claude response for input: "${originalInput}"`,
      "ResponseExploder"
    );

    try {
      // Parse XML elements from Claude's response
      const xmlElements = this.parseXMLElements(claudeResponse);

      // Convert XML elements to block creation requests
      const blocks = this.convertElementsToBlocks(xmlElements, claudeResponse);

      const processingTime = Date.now() - startTime;

      log.debug(
        `Successfully exploded response into ${blocks.length} blocks in ${processingTime}ms`,
        "ResponseExploder"
      );
      log.debug(
        `Block types created: ${blocks.map((b) => b.type).join(", ")}`,
        "ResponseExploder"
      );

      return {
        blocks,
        metadata: {
          originalInput,
          processingTime,
          blockCount: blocks.length,
        },
      };
    } catch (error) {
      log.debug(`Error exploding response: ${error}`, "ResponseExploder");

      // Fallback: create a single paragraph block with the raw response
      return {
        blocks: [
          {
            type: "paragraph",
            content: claudeResponse,
          },
        ],
        metadata: {
          originalInput,
          processingTime: Date.now() - startTime,
          blockCount: 1,
        },
      };
    }
  }

  /**
   * Parse XML elements from Claude's response
   */
  private static parseXMLElements(response: string): ParsedXMLElement[] {
    const elements: ParsedXMLElement[] = [];

    // Regex to match XML tags with optional attributes
    const xmlRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g;
    let match;

    while ((match = xmlRegex.exec(response)) !== null) {
      const [, tag, attributesStr, content] = match;

      // Parse attributes
      const attributes: Record<string, string> = {};
      const attrRegex = /(\w+)=["']([^"']*)["']/g;
      let attrMatch;

      while ((attrMatch = attrRegex.exec(attributesStr)) !== null) {
        attributes[attrMatch[1]] = attrMatch[2];
      }

      elements.push({
        tag: tag.toLowerCase(),
        content: content.trim(),
        attributes,
      });
    }

    return elements;
  }

  /**
   * Convert parsed XML elements to BlockNote block creation requests
   */
  private static convertElementsToBlocks(
    elements: ParsedXMLElement[],
    fullResponse: string
  ): BlockCreationRequest[] {
    const blocks: BlockCreationRequest[] = [];

    for (const element of elements) {
      // Handle lists specially since they can create multiple blocks
      if (
        element.tag === "list" ||
        element.tag === "ul" ||
        element.tag === "ol"
      ) {
        const listBlocks = this.createListBlocks(element);
        blocks.push(...listBlocks);
      } else {
        const blockRequest = this.convertElementToBlock(element);
        if (blockRequest) {
          blocks.push(blockRequest);
        }
      }
    }

    // If no XML elements were found, parse the response as plain text
    if (blocks.length === 0) {
      const textBlocks = this.parseAsPlainText(fullResponse);
      blocks.push(...textBlocks);
    }

    return blocks;
  }

  /**
   * Extract blockId from element attributes if present
   */
  private static extractBlockId(element: ParsedXMLElement): string | undefined {
    return (
      element.attributes.blockId || element.attributes.blockid || undefined
    );
  }

  /**
   * Convert a single XML element to a block creation request
   */
  private static convertElementToBlock(
    element: ParsedXMLElement
  ): BlockCreationRequest | null {
    switch (element.tag) {
      case "table":
        return this.createTableBlock(element);

      case "page":
      case "site":
        return this.createSiteBlock(element);

      case "h1":
      case "h2":
      case "h3":
      case "heading":
        return this.createHeadingBlock(element);

      case "p":
      case "paragraph":
        return this.createParagraphBlock(element);

      case "list":
      case "ul":
      case "ol":
        return this.createListBlock(element);

      case "code":
        return this.createCodeBlock(element);

      case "image":
        return this.createImageBlock(element);

      default:
        // Unknown tag, treat as paragraph
        return this.createParagraphBlock(element);
    }
  }

  /**
   * Create a table block from XML
   */
  private static createTableBlock(
    element: ParsedXMLElement
  ): BlockCreationRequest {
    // Parse table content into BlockNote's expected format
    const tableContent = this.parseTableContentForBlockNote(element.content);
    const blockId = this.extractBlockId(element);

    const block: BlockCreationRequest = {
      type: "table",
      content: tableContent,
    };

    if (blockId) {
      block.blockId = blockId;
    }

    return block;
  }

  /**
   * Extract URLs from table data for creating additional site blocks
   */
  private static extractUrlsFromTable(
    tableData: Record<string, any>
  ): string[] {
    const urls: string[] = [];

    if (tableData.rows && Array.isArray(tableData.rows)) {
      for (const row of tableData.rows) {
        if (Array.isArray(row)) {
          for (const cell of row) {
            if (typeof cell === "object" && cell.type === "url" && cell.value) {
              urls.push(cell.value);
            }
          }
        }
      }
    }

    return urls;
  }

  /**
   * Create a site/page block from XML
   */
  private static createSiteBlock(
    element: ParsedXMLElement
  ): BlockCreationRequest {
    const url = element.attributes.url || element.content;
    const blockId = this.extractBlockId(element);

    const block: BlockCreationRequest = {
      type: "site",
      props: {
        url: this.formatUrl(url),
      },
    };

    if (blockId) {
      block.blockId = blockId;
    }

    return block;
  }

  /**
   * Create a heading block from XML
   */
  private static createHeadingBlock(
    element: ParsedXMLElement
  ): BlockCreationRequest {
    let level = 1;

    // Determine heading level
    if (element.tag === "h1") level = 1;
    else if (element.tag === "h2") level = 2;
    else if (element.tag === "h3") level = 3;
    else if (element.attributes.level) {
      level = parseInt(element.attributes.level, 10) || 1;
    }

    const blockId = this.extractBlockId(element);

    const block: BlockCreationRequest = {
      type: "heading",
      props: {
        level: Math.min(Math.max(level, 1), 3), // Clamp to 1-3
      },
      content: element.content,
    };

    if (blockId) {
      block.blockId = blockId;
    }

    return block;
  }

  /**
   * Create a paragraph block from XML
   */
  private static createParagraphBlock(
    element: ParsedXMLElement
  ): BlockCreationRequest {
    const blockId = this.extractBlockId(element);

    const block: BlockCreationRequest = {
      type: "paragraph",
      content: element.content,
    };

    if (blockId) {
      block.blockId = blockId;
    }

    return block;
  }

  /**
   * Create multiple list item blocks from XML list
   */
  private static createListBlocks(
    element: ParsedXMLElement
  ): BlockCreationRequest[] {
    const isOrdered =
      element.tag === "ol" || element.attributes.type === "ordered";

    // Parse individual <item> elements within the list
    const itemMatches = element.content.match(/<item>(.*?)<\/item>/g);

    if (itemMatches && itemMatches.length > 0) {
      return itemMatches.map((itemMatch) => {
        const itemContent = itemMatch.replace(/<\/?item>/g, "").trim();
        return {
          type: isOrdered ? "numberedListItem" : "bulletListItem",
          content: itemContent,
        };
      });
    }

    // Fallback: treat entire content as a single list item
    return [
      {
        type: isOrdered ? "numberedListItem" : "bulletListItem",
        content: element.content,
      },
    ];
  }

  /**
   * Create list blocks from XML - returns multiple blocks for each item
   */
  private static createListBlock(
    element: ParsedXMLElement
  ): BlockCreationRequest {
    // This method is kept for compatibility with the switch statement
    // but we should use createListBlocks instead
    const blocks = this.createListBlocks(element);
    return blocks[0]; // Return first block only
  }

  /**
   * Create a code block from XML
   */
  private static createCodeBlock(
    element: ParsedXMLElement
  ): BlockCreationRequest {
    // BlockNote doesn't have a built-in code block, so use paragraph with monospace styling
    return {
      type: "paragraph",
      content: element.content,
      // Note: BlockNote styling would need to be handled differently
    };
  }

  /**
   * Create an image block from XML
   */
  private static createImageBlock(
    element: ParsedXMLElement
  ): BlockCreationRequest {
    const url =
      element.attributes.src || element.attributes.url || element.content;

    return {
      type: "image",
      props: {
        url: url,
        caption: element.attributes.alt || element.attributes.caption || "",
      },
    };
  }

  /**
   * Parse table content into BlockNote's expected TableContent format
   */
  private static parseTableContentForBlockNote(content: string): {
    type: "tableContent";
    rows: { cells: BlockNoteInlineContent[][] }[];
  } {
    // Clean up the content by removing XML tags
    const cleanContent = content
      .replace(/<\/?headers>/g, "")
      .replace(/<\/?row>/g, "")
      .trim();

    // Try to parse as CSV first
    const lines = cleanContent.split("\n").filter((line) => line.trim());

    if (lines.length > 0) {
      // Parse each line as a row
      const rows = lines.map((line) => {
        const cellTexts = line.split(",").map((cell) => cell.trim());

        // Convert each cell text to proper InlineContent array
        const cells = cellTexts.map((cellText) => {
          return this.parseTextToInlineContent(cellText);
        });

        return { cells };
      });

      return {
        type: "tableContent",
        rows,
      };
    }

    // Fallback: single cell table
    return {
      type: "tableContent",
      rows: [
        {
          cells: [[{ type: "text", text: content, styles: {} }]],
        },
      ],
    };
  }

  /**
   * Parse text content into InlineContent array, detecting URLs and creating Link objects
   */
  private static parseTextToInlineContent(
    text: string
  ): BlockNoteInlineContent[] {
    // Simple URL detection regex
    const urlRegex = /(https?:\/\/[^\s,]+)/g;
    const parts: any[] = [];
    let lastIndex = 0;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      // Add text before the URL
      if (match.index > lastIndex) {
        const beforeText = text.slice(lastIndex, match.index).trim();
        if (beforeText) {
          parts.push({
            type: "text",
            text: beforeText,
            styles: {},
          });
        }
      }

      // Add the URL as a Link object
      parts.push({
        type: "link",
        content: [
          {
            type: "text",
            text: match[0],
            styles: {},
          },
        ],
        href: match[0],
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after the last URL
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex).trim();
      if (remainingText) {
        parts.push({
          type: "text",
          text: remainingText,
          styles: {},
        });
      }
    }

    // If no URLs were found, return the entire text as a single StyledText object
    if (parts.length === 0) {
      parts.push({
        type: "text",
        text: text,
        styles: {},
      });
    }

    return parts;
  }

  /**
   * Parse table content from various formats (legacy method for URL extraction)
   */
  private static parseTableContent(content: string): Record<string, any> {
    // Try to parse as CSV first
    const lines = content.trim().split("\n");

    if (lines.length > 1) {
      // Assume first line is headers
      const headers = lines[0].split(",").map((h) => h.trim());
      const rows = lines
        .slice(1)
        .map((line) => line.split(",").map((cell) => cell.trim()));

      // Process rows to identify URLs and make them clickable
      const processedRows = rows.map((row) =>
        row.map((cell) => {
          // Check if cell looks like a URL
          if (this.isValidUrl(cell)) {
            return {
              type: "url",
              value: cell,
              display: this.extractDomainFromUrl(cell) || cell,
            };
          }
          return {
            type: "text",
            value: cell,
            display: cell,
          };
        })
      );

      return {
        headers,
        rows: processedRows,
        hasUrls: processedRows.some((row) =>
          row.some((cell) => cell.type === "url")
        ),
      };
    }

    // Fallback: single cell table
    return {
      headers: ["Content"],
      rows: [
        [
          {
            type: "text",
            value: content,
            display: content,
          },
        ],
      ],
      hasUrls: false,
    };
  }

  /**
   * Extract domain from URL for display purposes
   */
  private static extractDomainFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  /**
   * Parse response as plain text when no XML is found
   */
  private static parseAsPlainText(response: string): BlockCreationRequest[] {
    const blocks: BlockCreationRequest[] = [];
    const lines = response.trim().split("\n");

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) continue;

      // Check if it looks like a heading
      if (trimmedLine.startsWith("#")) {
        const level = Math.min((trimmedLine.match(/^#+/) || [""])[0].length, 3);
        const content = trimmedLine.replace(/^#+\s*/, "");

        blocks.push({
          type: "heading",
          props: { level },
          content,
        });
      }
      // Check if it looks like a URL
      else if (this.isValidUrl(trimmedLine)) {
        blocks.push({
          type: "site",
          props: { url: this.formatUrl(trimmedLine) },
        });
      }
      // Regular paragraph
      else {
        blocks.push({
          type: "paragraph",
          content: trimmedLine,
        });
      }
    }

    return blocks.length > 0
      ? blocks
      : [
          {
            type: "paragraph",
            content: response,
          },
        ];
  }

  /**
   * Check if a string is a valid URL
   */
  private static isValidUrl(input: string): boolean {
    try {
      new URL(input.includes("://") ? input : `https://${input}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Format a URL to ensure it has a protocol
   */
  private static formatUrl(input: string): string {
    if (!input) return input;
    if (!input.match(/^[a-zA-Z]+:\/\//)) {
      return `https://${input}`;
    }
    return input;
  }
}
