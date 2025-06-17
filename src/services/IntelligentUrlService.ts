import { log } from "../utils/mainLogger";
import { getAnthropicApiKey } from "../config/development";

// Simple result type - always returns XML to be exploded into blocks
export interface ProcessingResult {
  success: boolean;
  xmlResponse?: string;
  error?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  relevanceScore: number;
}

export interface ContentPreview {
  title: string;
  description: string;
  url: string;
  domain: string;
  type: "article" | "documentation" | "tool" | "social" | "other";
  keyPoints?: string[];
}

export interface DocumentContext {
  recentUrls: string[];
  currentTopics: string[];
  userPreferences: {
    preferredSources: string[];
    blockedDomains: string[];
  };
}

// Main process service for intelligent URL handling
export class IntelligentUrlService {
  private static instance: IntelligentUrlService;
  private anthropicApiKey: string | null = null;

  private constructor() {
    this.anthropicApiKey = getAnthropicApiKey();
  }

  public static getInstance(): IntelligentUrlService {
    if (!IntelligentUrlService.instance) {
      IntelligentUrlService.instance = new IntelligentUrlService();
    }
    return IntelligentUrlService.instance;
  }

  public isAvailable(): boolean {
    return this.anthropicApiKey !== null;
  }

  private isDirectUrl(input: string): boolean {
    try {
      const url = new URL(input);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  private async callAnthropic(prompt: string): Promise<string> {
    if (!this.anthropicApiKey) {
      throw new Error("Anthropic API key not available");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  public async processInput(
    input: string,
    documentContext?: any
  ): Promise<ProcessingResult> {
    try {
      // Handle empty input
      if (!input.trim()) {
        return {
          success: false,
          error: "Please describe what you're looking for, or enter a url",
        };
      }

      // Handle direct URLs - create a simple page block
      if (this.isDirectUrl(input)) {
        return {
          success: true,
          xmlResponse: `<page url="${input}"></page>`,
        };
      }

      // Build document context section for the prompt
      let documentContextSection = "";
      if (
        documentContext &&
        documentContext.document &&
        documentContext.document.length > 0
      ) {
        const docSummary = this.summarizeDocument(documentContext.document);
        documentContextSection = `

DOCUMENT CONTEXT:
The user is working on a document that currently contains ${documentContext.blockCount} blocks. Here's the current content in XML format (the same format you should use in your response):

${docSummary}

Please consider this existing content when generating your response. Look for opportunities to:
- **enrich** existing blocks with missing details, better structure, or refined insights
- **connect** new information to existing themes and topics
- **compress** multiple related ideas into cohesive, dense understanding

To UPDATE existing blocks: copy their exact blockId attribute
To CREATE new blocks: omit the blockId attribute
`;

        log.debug(
          `Document context includes ${documentContext.blockCount} blocks in XML format with blockId attributes for editing`,
          "IntelligentUrlService"
        );
      }

      const systemPrompt = `You are a curious and fastidious friend helping with Digest - a document editor designed to compress and refine information gathered while exploring the internet. Your role is to help sharpen understanding and create dense, high-quality knowledge.

Think of yourself as detail-oriented yet wryly aware of the much bigger picture.

A common scenario: maybe someone is comparing products, trying to find the best one. They ask what each option costs. Maybe take the opportunity to rewrite the list as a table.

Example transformation - if you see this existing content:
<list blockId="abc-123">
<item>Notion - Great for teams</item>
<item>Obsidian - Good for linking</item>
<item>Roam - Research focused</item>
</list>

And someone asks about pricing, transform it to:
<table blockId="abc-123">
Tool,Focus,Price
Notion,Great for teams,$8/month
Obsidian,Good for linking,Free
Roam,Research focused,$15/month
</table>

${documentContextSection}

Your job is to respond with XML that will be converted into document blocks. Use these XML tags:

**BLOCK EDITING SUPPORT:**
You can UPDATE existing blocks by including a blockId attribute. If blockId is provided, the existing block will be updated instead of creating a new one.
Example: <p blockId="4e1e3e6a-4f14-488b-ae68-e8d4e604a213">Updated paragraph content</p>

<page url="https://example.com" blockId="optional-block-id">
For specific websites or services that should be navigated to directly.
</page>

<table blockId="optional-block-id">
Create comparison tables with headers and data rows. Always include a URL column when comparing websites/services.
Use simple CSV format inside the table tags.
Example:
<table>
Site,URL,Focus,Community Size,Key Features
Hacker News,https://news.ycombinator.com,Tech/Startup,Large,Voting system
Reddit,https://reddit.com,General,Very Large,Subreddits
</table>

<h1 blockId="optional-block-id">, <h2 blockId="optional-block-id">, <h3 blockId="optional-block-id">
For section headings.
Example: <h2>Social Media Platforms</h2>

<p blockId="optional-block-id">
For explanatory text or descriptions.
Example: <p>Here are the top social media platforms for developers:</p>

<image url="https://example.com/image.jpg" alt="Description" blockId="optional-block-id">
For relevant images.
</image>

<list blockId="optional-block-id">
<item>First item</item>
<item>Second item</item>
</list>

CRITICAL XML FORMATTING RULES:
- NEVER nest <page> tags inside <list> or <item> tags
- NEVER nest <page> tags inside any other tags
- <page> tags must be standalone, top-level elements only
- If you need to mention URLs within list items, just use plain text for the URL
- If a list contains multiple URLs that should be navigated to, create separate <page> blocks AFTER the list

WRONG (DO NOT DO THIS):
<list>
<item>LangChain - <page url="https://python.langchain.com/"></page></item>
</list>

CORRECT APPROACH:
<list>
<item>LangChain - https://python.langchain.com/</item>
</list>
<page url="https://python.langchain.com/"></page>

IMPORTANT PRIORITY RULES:
1. **Single Service Names/Jump Links**: If the user provides a single word or short phrase that clearly refers to a well-known service, website, or platform, respond with ONLY a single <page> tag pointing to that service's homepage.

Examples of single service requests:
- "gmail" → <page url="https://gmail.com"></page>
- "facebook" → <page url="https://facebook.com"></page>
- "github" → <page url="https://github.com"></page>
- "youtube" → <page url="https://youtube.com"></page>
- "twitter" → <page url="https://twitter.com"></page>
- "linkedin" → <page url="https://linkedin.com"></page>
- "instagram" → <page url="https://instagram.com"></page>
- "reddit" → <page url="https://reddit.com"></page>
- "stackoverflow" → <page url="https://stackoverflow.com"></page>
- "amazon" → <page url="https://amazon.com"></page>
- "netflix" → <page url="https://netflix.com"></page>
- "spotify" → <page url="https://spotify.com"></page>

2. **Comparison Requests**: Only create tables when the user explicitly asks to compare multiple things or uses words like "compare", "vs", "alternatives", "options", etc.

3. **Research/Exploration**: Create structured content with headings, paragraphs, and lists when the user asks for information about a topic.

4. If a page is already opened, we do not need to open it again. One is enough.

Guidelines:
- Prioritize single <page> responses for clear service name requests
- Include 3-5 relevant options when comparing, focusing on quality over quantity
- Add brief explanatory text only when it adds genuine value
- Use appropriate headings to organize content hierarchically
- When mentioning specific sites, include their URLs
- Keep responses focused, actionable, and dense with useful information

Respond ONLY with XML tags. Do not include any other text or explanations.`;

      const userPrompt = `${input}`;

      const fullPrompt = `${systemPrompt}\n\nUser request: ${userPrompt}`;

      // Log the full prompt being sent to the LLM
      log.debug("=== LLM PROMPT START ===", "IntelligentUrlService");
      log.debug(fullPrompt, "IntelligentUrlService");
      log.debug("=== LLM PROMPT END ===", "IntelligentUrlService");

      const response = await this.callAnthropic(fullPrompt);

      // Log the LLM response
      log.debug("=== LLM RESPONSE START ===", "IntelligentUrlService");
      log.debug(response, "IntelligentUrlService");
      log.debug("=== LLM RESPONSE END ===", "IntelligentUrlService");

      return {
        success: true,
        xmlResponse: response,
      };
    } catch (error) {
      console.error("Error processing input:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Create a summary of the document content for LLM context using XML format
   * This matches the output format the LLM should produce, making it easier to copy/update blocks
   */
  private summarizeDocument(document: any[]): string {
    try {
      const xmlBlocks: string[] = [];

      // Log the raw document structure to see what we're working with
      log.debug("=== DOCUMENT STRUCTURE START ===", "IntelligentUrlService");
      log.debug(
        JSON.stringify(document.slice(0, 3), null, 2),
        "IntelligentUrlService"
      ); // First 3 blocks
      log.debug("=== DOCUMENT STRUCTURE END ===", "IntelligentUrlService");

      // Convert each block to XML format that matches our expected output
      for (let i = 0; i < document.length; i++) {
        const block = document[i];
        const blockId = block.id || "no-id";

        if (block.type === "heading") {
          const level = block.props?.level || 1;
          const text = this.extractTextContent(block.content);
          if (text.trim()) {
            xmlBlocks.push(
              `<h${level} blockId="${blockId}">${text}</h${level}>`
            );
          }
        } else if (block.type === "paragraph") {
          const text = this.extractTextContent(block.content);
          if (text.trim()) {
            xmlBlocks.push(`<p blockId="${blockId}">${text}</p>`);
          }
        } else if (block.type === "site") {
          const url = block.props?.url;
          if (url) {
            xmlBlocks.push(`<page url="${url}" blockId="${blockId}"></page>`);
          }
        } else if (
          block.type === "bulletListItem" ||
          block.type === "numberedListItem"
        ) {
          const text = this.extractTextContent(block.content);
          if (text.trim()) {
            // Note: List items are typically grouped, but for now we'll show individual items
            // In a full implementation, we might want to group consecutive list items
            const listType = block.type === "numberedListItem" ? "ol" : "ul";
            xmlBlocks.push(
              `<${listType} blockId="${blockId}"><item>${text}</item></${listType}>`
            );
          }
        } else if (block.type === "table") {
          const tableContent = this.extractTableContent(block);
          if (tableContent) {
            xmlBlocks.push(
              `<table blockId="${blockId}">\n${tableContent}\n</table>`
            );
          } else {
            xmlBlocks.push(
              `<table blockId="${blockId}"><!-- Table with ${
                block.content?.rows?.length || 0
              } rows --></table>`
            );
          }
        }
      }

      return xmlBlocks.join("\n\n");
    } catch (error) {
      log.debug(
        `Error summarizing document: ${error}`,
        "IntelligentUrlService"
      );
      return "Unable to summarize document content";
    }
  }

  /**
   * Extract plain text content from BlockNote content structure
   */
  private extractTextContent(content: any): string {
    if (!content) return "";

    if (typeof content === "string") return content;

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === "string") return item;
          if (item.type === "text") return item.text || "";
          if (item.type === "link")
            return this.extractTextContent(item.content);
          return "";
        })
        .join("");
    }

    if (content.text) return content.text;

    return "";
  }

  /**
   * Extract table content in a readable format for LLM context
   */
  private extractTableContent(block: any): string | null {
    try {
      if (!block.content || !block.content.rows) return null;

      const rows = block.content.rows;
      if (rows.length === 0) return null;

      // Convert table to CSV-like format
      const tableLines: string[] = [];

      for (const row of rows) {
        if (row.cells && Array.isArray(row.cells)) {
          const cellTexts = row.cells.map((cell: any) => {
            if (Array.isArray(cell)) {
              return cell.map((item) => this.extractTextContent(item)).join("");
            }
            return this.extractTextContent(cell);
          });
          tableLines.push(cellTexts.join(","));
        }
      }

      return tableLines.join("\n");
    } catch (error) {
      log.debug(
        `Error extracting table content: ${error}`,
        "IntelligentUrlService"
      );
      return null;
    }
  }

  /**
   * Get document context from the current editor state
   */
  static extractDocumentContext(editorContent?: any): DocumentContext {
    // This would analyze the current document to extract context
    // For now, return a basic context
    return {
      recentUrls: [],
      currentTopics: [],
      userPreferences: {
        preferredSources: [
          "github.com",
          "docs.google.com",
          "stackoverflow.com",
        ],
        blockedDomains: [],
      },
    };
  }
}
