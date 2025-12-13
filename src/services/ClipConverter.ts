import { ClipDraft } from "../types/clip";
import { CustomPartialBlock } from "../types/schema";
import { log } from "../utils/rendererLogger";

/**
 * Converts HTML/text selection into BlockNote blocks
 * Deterministic path (cheap, fast)
 */
export class ClipConverter {
  private static instance: ClipConverter;

  public static getInstance(): ClipConverter {
    if (!ClipConverter.instance) {
      ClipConverter.instance = new ClipConverter();
    }
    return ClipConverter.instance;
  }

  /**
   * Convert a clip draft's HTML/text into proposed BlockNote blocks
   */
  async convertToBlocks(draft: ClipDraft): Promise<CustomPartialBlock[]> {
    const startTime = Date.now();
    log.debug(`Converting clip draft ${draft.id} to blocks`, "ClipConverter");

    try {
      // Update conversion status
      draft.conversion = {
        status: "converting",
        strategy: "deterministic",
        logs: [],
      };

      const blocks: CustomPartialBlock[] = [];

      // If we have HTML, parse it; otherwise use text-only
      if (draft.selectionHtml && draft.selectionHtml.trim()) {
        blocks.push(...this.convertHtmlToBlocks(draft.selectionHtml));
      } else if (draft.selectionText) {
        blocks.push(...this.convertTextToBlocks(draft.selectionText));
      }

      const latency = Date.now() - startTime;
      log.debug(
        `Converted clip draft ${draft.id} to ${blocks.length} blocks in ${latency}ms`,
        "ClipConverter"
      );

      draft.conversion = {
        status: "completed",
        strategy: "deterministic",
        logs: [`Converted ${blocks.length} blocks in ${latency}ms`],
      };

      return blocks;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      log.debug(
        `Error converting clip draft ${draft.id}: ${errorMessage}`,
        "ClipConverter"
      );

      draft.conversion = {
        status: "failed",
        strategy: "deterministic",
        error: errorMessage,
        logs: [`Conversion failed: ${errorMessage}`],
      };

      // Fallback to text-only conversion
      return this.convertTextToBlocks(draft.selectionText || "");
    }
  }

  /**
   * Convert HTML string to BlockNote blocks
   */
  private convertHtmlToBlocks(html: string): CustomPartialBlock[] {
    // Create a temporary DOM element to parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Sanitize and normalize the DOM
    this.sanitizeDom(doc.body);

    const blocks: CustomPartialBlock[] = [];

    // Walk through the DOM and convert to blocks
    this.walkDom(doc.body, blocks);

    // Post-process: merge/split paragraphs, trim whitespace
    return this.postProcessBlocks(blocks);
  }

  /**
   * Convert plain text to BlockNote blocks
   */
  private convertTextToBlocks(text: string): CustomPartialBlock[] {
    const lines = text.split(/\n+/).filter((line) => line.trim().length > 0);

    return lines.map((line) => ({
      type: "paragraph",
      content: line.trim(),
    }));
  }

  /**
   * Sanitize DOM: remove scripts, styles, irrelevant attributes
   */
  private sanitizeDom(element: Element): void {
    // Remove script and style elements
    const scripts = element.querySelectorAll("script, style");
    scripts.forEach((el) => el.remove());

    // Remove irrelevant attributes (keep only essential ones)
    const allElements = element.querySelectorAll("*");
    allElements.forEach((el) => {
      // Keep only essential attributes
      const allowedAttrs = ["href", "src", "alt", "title"];
      Array.from(el.attributes).forEach((attr) => {
        if (!allowedAttrs.includes(attr.name.toLowerCase())) {
          el.removeAttribute(attr.name);
        }
      });
    });
  }

  /**
   * Walk DOM tree and convert nodes to blocks
   */
  private walkDom(
    element: Element | DocumentFragment,
    blocks: CustomPartialBlock[]
  ): void {
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text && text.length > 0) {
          // Add as paragraph if we don't have a current block
          if (blocks.length === 0 || blocks[blocks.length - 1].type !== "paragraph") {
            blocks.push({
              type: "paragraph",
              content: text,
            });
          } else {
            // Append to last paragraph
            const lastBlock = blocks[blocks.length - 1];
            if (lastBlock.type === "paragraph") {
              const currentContent =
                typeof lastBlock.content === "string"
                  ? lastBlock.content
                  : "";
              blocks[blocks.length - 1] = {
                ...lastBlock,
                content: currentContent ? `${currentContent} ${text}` : text,
              };
            }
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tagName = el.tagName.toLowerCase();

        switch (tagName) {
          case "h1":
          case "h2":
          case "h3":
          case "h4":
          case "h5":
          case "h6":
            const level = parseInt(tagName.charAt(1)) as 1 | 2 | 3 | 4 | 5 | 6;
            blocks.push({
              type: "heading",
              props: { level },
              content: el.textContent?.trim() || "",
            });
            break;

          case "p":
            const pText = el.textContent?.trim();
            if (pText) {
              blocks.push({
                type: "paragraph",
                content: pText,
              });
            }
            break;

          case "ul":
          case "ol":
            this.convertList(el, blocks, tagName === "ol");
            break;

          case "blockquote":
            const quoteText = el.textContent?.trim();
            if (quoteText) {
              blocks.push({
                type: "paragraph",
                content: quoteText,
                // Note: BlockNote doesn't have a native blockquote block,
                // so we'll use paragraph for now
              });
            }
            break;

          case "img":
            const src = el.getAttribute("src");
            const alt = el.getAttribute("alt") || "";
            if (src) {
              blocks.push({
                type: "image",
                props: {
                  url: src,
                  caption: alt,
                },
              });
            }
            break;

          case "pre":
          case "code":
            const codeText = el.textContent?.trim();
            if (codeText) {
              blocks.push({
                type: "paragraph",
                content: codeText,
                // Note: We could use a code block if BlockNote supports it
              });
            }
            break;

          case "br":
            // Force a new paragraph
            blocks.push({
              type: "paragraph",
              content: "",
            });
            break;

          default:
            // Recursively process child nodes
            this.walkDom(el, blocks);
            break;
        }
      }
    }
  }

  /**
   * Convert list (ul/ol) to list item blocks
   */
  private convertList(
    listElement: Element,
    blocks: CustomPartialBlock[],
    ordered: boolean
  ): void {
    const items = listElement.querySelectorAll("li");
    items.forEach((item) => {
      const text = item.textContent?.trim();
      if (text) {
        blocks.push({
          type: ordered ? "numberedListItem" : "bulletListItem",
          content: text,
        });
      }
    });
  }

  /**
   * Post-process blocks: merge/split paragraphs, trim whitespace, limit depth
   */
  private postProcessBlocks(blocks: CustomPartialBlock[]): CustomPartialBlock[] {
    const processed: CustomPartialBlock[] = [];
    const MAX_BLOCKS = 1000; // Safety limit

    for (let i = 0; i < Math.min(blocks.length, MAX_BLOCKS); i++) {
      const block = blocks[i];

      // Trim content if it's a string
      if (typeof block.content === "string") {
        const trimmed = block.content.trim();
        if (trimmed.length === 0 && block.type === "paragraph") {
          // Skip empty paragraphs
          continue;
        }
        block.content = trimmed;
      }

      processed.push(block);
    }

    return processed;
  }
}



