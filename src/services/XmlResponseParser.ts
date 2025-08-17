import { log } from "../utils/mainLogger";
import { getEventLogger } from "./EventLogger";
import { BlockCreationRequest } from "./ResponseExploder";

// Type definitions for XML parsing
interface ParsedXMLElement {
  tag: string;
  content: string;
  attributes: Record<string, string>;
}

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

/**
 * Separate class for parsing XML responses into BlockNote-compatible block structures
 * Extracted from ResponseExploder to be used by ContentProcessor
 */
export class XmlResponseParser {
  private eventLogger: ReturnType<typeof getEventLogger>;

  constructor() {
    this.eventLogger = getEventLogger();
  }

  /**
   * Main entry point: parse XML response into block creation requests
   */
  async parseXmlResponse(xmlResponse: string, requestId: string): Promise<BlockCreationRequest[]> {
    try {
      this.eventLogger.logSystemEvent('xml-parser:parsing-started', {
        responseLength: xmlResponse.length
      }, {
        requestId,
        source: 'XmlResponseParser'
      });

      // Parse XML elements from Claude's response
      const xmlElements = this.parseXMLElements(xmlResponse);

      this.eventLogger.logSystemEvent('xml-parser:elements-parsed', {
        elementCount: xmlElements.length,
        elementTypes: xmlElements.map(e => e.tag)
      }, {
        requestId,
        source: 'XmlResponseParser'
      });

      // Convert XML elements to block creation requests
      const blockRequests = this.convertElementsToBlocks(xmlElements, xmlResponse);

      this.eventLogger.logSystemEvent('xml-parser:blocks-converted', {
        blockCount: blockRequests.length,
        blockTypes: blockRequests.map(b => b.type)
      }, {
        requestId,
        source: 'XmlResponseParser'
      });

      return blockRequests;
    } catch (error) {
      this.eventLogger.logSystemEvent('xml-parser:parsing-failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, {
        requestId,
        source: 'XmlResponseParser'
      });

      // Fallback: create a single paragraph with the raw response
      log.debug(`Error parsing XML response: ${error}`, "XmlResponseParser");
      
      return [{
        type: 'paragraph',
        content: xmlResponse
      }];
    }
  }

  /**
   * Parse XML elements from Claude's response
   */
  private parseXMLElements(response: string): ParsedXMLElement[] {
    const elements: ParsedXMLElement[] = [];

    log.debug(
      `[XmlResponseParser] Parsing XML response: ${response.substring(0, 500)}...`,
      "XmlResponseParser"
    );

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

      const element = {
        tag: tag.toLowerCase(),
        content: content.trim(),
        attributes,
      };

      log.debug(
        `[XmlResponseParser] Parsed element: ${tag} with content: ${content.substring(0, 100)}...`,
        "XmlResponseParser"
      );
      elements.push(element);
    }

    log.debug(
      `[XmlResponseParser] Total elements parsed: ${elements.length}`,
      "XmlResponseParser"
    );
    return elements;
  }

  /**
   * Convert parsed XML elements to BlockNote block creation requests
   */
  private convertElementsToBlocks(
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
  private extractBlockId(element: ParsedXMLElement): string | undefined {
    return (
      element.attributes.blockId || element.attributes.blockid || undefined
    );
  }

  /**
   * Convert a single XML element to a block creation request
   */
  private convertElementToBlock(
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
  private createTableBlock(element: ParsedXMLElement): BlockCreationRequest {
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
   * Create a site/page block from XML
   */
  private createSiteBlock(element: ParsedXMLElement): BlockCreationRequest {
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
  private createHeadingBlock(element: ParsedXMLElement): BlockCreationRequest {
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
      content: this.parseHtmlToInlineContent(element.content),
    };

    if (blockId) {
      block.blockId = blockId;
    }

    return block;
  }

  /**
   * Create a paragraph block from XML
   */
  private createParagraphBlock(element: ParsedXMLElement): BlockCreationRequest {
    const blockId = this.extractBlockId(element);

    const block: BlockCreationRequest = {
      type: "paragraph",
      content: this.parseHtmlToInlineContent(element.content),
    };

    if (blockId) {
      block.blockId = blockId;
    }

    return block;
  }

  /**
   * Create multiple list item blocks from XML list
   */
  private createListBlocks(element: ParsedXMLElement): BlockCreationRequest[] {
    const isOrdered =
      element.tag === "ol" || element.attributes.type === "ordered";

    // Parse individual <item> elements within the list
    const itemMatches = element.content.match(/<item>(.*?)<\/item>/g);

    if (itemMatches && itemMatches.length > 0) {
      return itemMatches.map((itemMatch) => {
        // Remove <item> tags and parse HTML content
        const htmlContent = itemMatch.replace(/<\/?item>/g, "").trim();
        const inlineContent = this.parseHtmlToInlineContent(htmlContent);
        return {
          type: isOrdered ? "numberedListItem" : "bulletListItem",
          content: inlineContent,
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
  private createListBlock(element: ParsedXMLElement): BlockCreationRequest {
    // This method is kept for compatibility with the switch statement
    // but we should use createListBlocks instead
    const blocks = this.createListBlocks(element);
    return blocks[0]; // Return first block only
  }

  /**
   * Create a code block from XML
   */
  private createCodeBlock(element: ParsedXMLElement): BlockCreationRequest {
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
  private createImageBlock(element: ParsedXMLElement): BlockCreationRequest {
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
  private parseTableContentForBlockNote(content: string): {
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
   * Parse HTML content into BlockNote InlineContent format
   */
  private parseHtmlToInlineContent(html: string): BlockNoteInlineContent[] {
    const result: BlockNoteInlineContent[] = [];

    // Simple HTML parser that handles basic formatting
    const htmlRegex = /(<[^>]*>)|([^<]+)/g;
    let match;
    let currentStyles: Record<string, any> = {};
    const styleStack: Record<string, any>[] = [];

    while ((match = htmlRegex.exec(html)) !== null) {
      const [fullMatch, tag, text] = match;

      if (tag) {
        // Handle opening/closing tags
        const tagName = tag.match(/<\/?(\w+)/)?.[1]?.toLowerCase();
        const isClosing = tag.startsWith("</");

        if (tagName === "strong" || tagName === "b") {
          if (isClosing) {
            currentStyles = styleStack.pop() || {};
          } else {
            styleStack.push({ ...currentStyles });
            currentStyles = { ...currentStyles, bold: true };
          }
        } else if (tagName === "em" || tagName === "i") {
          if (isClosing) {
            currentStyles = styleStack.pop() || {};
          } else {
            styleStack.push({ ...currentStyles });
            currentStyles = { ...currentStyles, italic: true };
          }
        }
      } else if (text && text.trim()) {
        result.push({
          type: "text",
          text: text,
          styles: { ...currentStyles },
        });
      }
    }

    // If no content was parsed, return plain text
    if (result.length === 0) {
      result.push({
        type: "text",
        text: html.replace(/<[^>]*>/g, "").trim(),
        styles: {},
      });
    }

    return result;
  }

  /**
   * Parse text content into InlineContent array, detecting URLs and creating Link objects
   */
  private parseTextToInlineContent(text: string): BlockNoteInlineContent[] {
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
   * Parse response as plain text when no XML is found
   */
  private parseAsPlainText(response: string): BlockCreationRequest[] {
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
  private isValidUrl(input: string): boolean {
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
  private formatUrl(input: string): string {
    if (!input) return input;
    if (!input.match(/^[a-zA-Z]+:\/\//)) {
      return `https://${input}`;
    }
    return input;
  }
}