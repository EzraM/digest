import { ClipDraft } from "../core/types";
import { IClipConverter } from "../core/interfaces";
import { CustomPartialBlock, schema } from "../../../types/schema";
import { log } from "../../../utils/rendererLogger";
import { BlockNoteEditor } from "@blocknote/core";

/**
 * Converts HTML/text selection into BlockNote blocks
 * Uses BlockNote's built-in HTML parser to preserve inline formatting (bold, italic, links, etc.)
 */
export class ClipConverter implements IClipConverter {
  private static instance: ClipConverter;
  private tempEditor: ReturnType<
    typeof BlockNoteEditor.create<{ schema: typeof schema }>
  > | null = null;

  public static getInstance(): ClipConverter {
    if (!ClipConverter.instance) {
      ClipConverter.instance = new ClipConverter();
    }
    return ClipConverter.instance;
  }

  /**
   * Get or create a temporary editor instance for HTML parsing
   * This editor is only used for parsing, not for editing
   */
  private getTempEditor() {
    if (!this.tempEditor) {
      this.tempEditor = BlockNoteEditor.create({
        schema,
      });
    }
    return this.tempEditor;
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

      // If we have HTML, parse it using BlockNote's HTML parser (preserves inline formatting)
      // Otherwise use text-only conversion
      if (draft.selectionHtml && draft.selectionHtml.trim()) {
        // Normalize relative URLs to absolute URLs based on the source domain
        const normalizedHtml = this.normalizeUrlsInHtml(
          draft.selectionHtml,
          draft.sourceUrl
        );
        blocks.push(...this.convertHtmlToBlocks(normalizedHtml));
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
   * Normalize relative URLs in HTML to absolute URLs based on the source URL
   * Converts relative URLs (like /page.html, ../other.html) to absolute URLs
   * (like https://example.com/page.html) so links work correctly when viewed later
   */
  private normalizeUrlsInHtml(html: string, sourceUrl: string): string {
    try {
      // Parse the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Create a base URL from the source URL for resolving relative URLs
      const baseUrl = new URL(sourceUrl);

      /**
       * Helper to normalize a single URL
       * Returns the absolute URL, or the original if normalization fails
       */
      const normalizeUrl = (url: string): string => {
        // Skip if already absolute (starts with http:// or https://)
        if (/^https?:\/\//i.test(url)) {
          return url;
        }
        // Skip if it's a protocol-relative URL (starts with //)
        if (url.startsWith("//")) {
          return url;
        }
        // Convert hash URLs to fully qualified URLs by appending to the base URL
        if (url.startsWith("#")) {
          // Create a new URL from the base URL and append the hash fragment
          const fullUrl = new URL(baseUrl);
          fullUrl.hash = url;
          return fullUrl.href;
        }
        // Skip if it's a data URI
        if (url.startsWith("data:")) {
          return url;
        }
        // Skip if it's a mailto: or tel: link
        if (/^(mailto|tel):/i.test(url)) {
          return url;
        }
        try {
          // Resolve relative URL against the base URL
          return new URL(url, baseUrl).href;
        } catch (error) {
          // If URL parsing fails (e.g., invalid URL), return original
          log.debug(
            `Failed to normalize URL: ${url}`,
            "ClipConverter.normalizeUrlsInHtml"
          );
          return url;
        }
      };

      // Find all anchor tags and convert relative hrefs to absolute
      const links = doc.querySelectorAll("a[href]");
      links.forEach((link) => {
        const href = link.getAttribute("href");
        if (href) {
          const normalized = normalizeUrl(href);
          if (normalized !== href) {
            link.setAttribute("href", normalized);
          }
        }
      });

      // Normalize image src URLs
      const images = doc.querySelectorAll("img[src]");
      images.forEach((img) => {
        const src = img.getAttribute("src");
        if (src) {
          const normalized = normalizeUrl(src);
          if (normalized !== src) {
            img.setAttribute("src", normalized);
          }
        }
        // Also normalize srcset if present
        const srcset = img.getAttribute("srcset");
        if (srcset) {
          // srcset format: "url1 1x, url2 2x" or "url1 100w, url2 200w"
          const normalizedSrcset = srcset
            .split(",")
            .map((entry) => {
              const parts = entry.trim().split(/\s+/);
              if (parts.length > 0) {
                const url = parts[0];
                const normalized = normalizeUrl(url);
                return (
                  normalized +
                  (parts.length > 1 ? " " + parts.slice(1).join(" ") : "")
                );
              }
              return entry;
            })
            .join(", ");
          if (normalizedSrcset !== srcset) {
            img.setAttribute("srcset", normalizedSrcset);
          }
        }
      });

      // Normalize other elements that might have URL attributes
      // (e.g., video, audio, source, iframe, etc.)
      const urlAttributes = ["src", "href", "poster", "data-src", "data-href"];
      urlAttributes.forEach((attr) => {
        const elements = doc.querySelectorAll(`[${attr}]`);
        elements.forEach((el) => {
          const url = el.getAttribute(attr);
          if (url) {
            const normalized = normalizeUrl(url);
            if (normalized !== url) {
              el.setAttribute(attr, normalized);
            }
          }
        });
      });

      // Return the normalized HTML
      // Use body.innerHTML to get the content, or the entire document if body is empty
      return doc.body.innerHTML || doc.documentElement.innerHTML;
    } catch (error) {
      // If HTML parsing fails, return original HTML
      log.debug(
        `Failed to normalize URLs in HTML: ${error}`,
        "ClipConverter.normalizeUrlsInHtml"
      );
      return html;
    }
  }

  /**
   * Convert HTML string to BlockNote blocks using BlockNote's built-in parser
   * This preserves inline formatting (bold, italic, links, lists, etc.)
   * Uses the same conversion pipeline as paste operations
   */
  private convertHtmlToBlocks(html: string): CustomPartialBlock[] {
    const editor = this.getTempEditor();

    // Use BlockNote's tryParseHTMLToBlocks which uses the same conversion
    // pipeline as paste operations - this preserves all inline formatting
    // (bold, italic, links, lists, etc.) through ProseMirror's schema parseDOM rules
    const blocks = editor.tryParseHTMLToBlocks(html) as CustomPartialBlock[];

    return blocks;
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
}
