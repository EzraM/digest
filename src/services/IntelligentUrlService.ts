import { log } from "../utils/mainLogger";
import { getAnthropicApiKey } from "../config/development";

// Enhanced site block states
export type SiteBlockStatus =
  | "entry" // Initial input state
  | "processing" // LLM is analyzing the input
  | "page" // Direct URL navigation
  | "preview" // Minimized preview with expand option
  | "search_results" // Search results with selection options
  | "error"; // Error state

// Input classification types
export type InputClassification =
  | "direct_url" // Valid URL that can be navigated to directly
  | "jump_link" // Shortcut like "gmail", "github", "docs"
  | "search_query" // Search terms that need web search
  | "ambiguous" // Unclear intent, needs clarification
  | "invalid"; // Invalid or problematic input

// Result types for different processing outcomes
export interface ProcessingResult {
  classification: InputClassification;
  confidence: number;
  action: "navigate" | "search" | "clarify" | "error" | "explode";
  data?: {
    url?: string;
    searchResults?: SearchResult[];
    suggestions?: string[];
    preview?: ContentPreview;
    error?: string;
    xmlResponse?: string;
    originalInput?: string;
    description?: string;
  };
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
  private apiKey: string;
  private baseUrl = "https://api.anthropic.com/v1/messages";

  constructor() {
    // Get API key from environment or .env.local file
    this.apiKey = getAnthropicApiKey();

    if (!this.apiKey) {
      log.debug(
        "No Anthropic API key found. Intelligent URL processing will use fallback mode.",
        "IntelligentUrlService"
      );
    } else {
      log.debug(
        "Anthropic API key loaded successfully",
        "IntelligentUrlService"
      );
    }
  }

  /**
   * Check if intelligent processing is available
   */
  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Main entry point for processing user input
   */
  async processInput(
    input: string,
    context?: DocumentContext
  ): Promise<ProcessingResult> {
    try {
      log.debug(`Processing input: "${input}"`, "IntelligentUrlService");

      // Quick validation
      if (!input.trim()) {
        return {
          classification: "invalid",
          confidence: 1.0,
          action: "error",
          data: { error: "Empty input" },
        };
      }

      // Check if intelligent processing is available
      if (!this.isAvailable()) {
        log.debug(
          "API key not available, using fallback classification",
          "IntelligentUrlService"
        );
        return this.fallbackClassification(input);
      }

      // Use Claude Sonnet 4 with web search to analyze and process the input
      const result = await this.analyzeWithClaude(input, context);

      log.debug(
        `Analysis result: ${JSON.stringify(result)}`,
        "IntelligentUrlService"
      );
      return result;
    } catch (error) {
      log.debug(`Error processing input: ${error}`, "IntelligentUrlService");
      return {
        classification: "invalid",
        confidence: 1.0,
        action: "error",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  /**
   * Use Claude Sonnet 4 with web search to analyze the input
   */
  private async analyzeWithClaude(
    input: string,
    context?: DocumentContext
  ): Promise<ProcessingResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userPrompt = this.buildUserPrompt(input, context);

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: userPrompt,
            },
          ],
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 3,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return this.parseClaudeResponse(data, input);
    } catch (error) {
      log.debug(`Claude API error: ${error}`, "IntelligentUrlService");

      // Fallback to basic classification without LLM
      return this.fallbackClassification(input);
    }
  }

  /**
   * Build the system prompt for Claude
   */
  private buildSystemPrompt(context?: DocumentContext): string {
    return `You are an intelligent URL and search handler for a document editor. Your job is to analyze user input and create appropriate content blocks using XML formatting.

When responding, you should create structured content using XML tags that will be converted into editor blocks:

AVAILABLE XML TAGS:
- <table>CSV data or structured comparison</table> - Creates a table block (URLs in tables automatically create additional site blocks)
- <page url="https://example.com">Optional description</page> - Creates a browser/site block  
- <h1>Main heading</h1>, <h2>Section heading</h2>, <h3>Subsection</h3> - Creates heading blocks
- <p>Paragraph content</p> - Creates paragraph blocks
- <ul>List content</ul>, <ol>Ordered list</ol> - Creates list blocks
- <image src="url" alt="description">Caption</image> - Creates image blocks

RESPONSE STRATEGY:
For queries like "websites similar to slashdot but more modern", you should respond with:
1. A table comparing the sites (include URLs in the table - they'll automatically become clickable site blocks)
2. Optionally add one featured page block for the most recommended option
3. Explanatory paragraphs with headings

IMPORTANT: When including URLs in tables, they will automatically create additional site blocks for easy navigation. You don't need to create separate <page> blocks for every URL in the table.

RESPONSE GUIDELINES:
- For direct URLs: respond with <page url="formatted-url">Optional description</page>
- For search queries: create rich content with tables, headings, and multiple page blocks
- For jump links: resolve to the correct URL and respond with a page block
- Always use XML tags - do NOT return JSON

EXAMPLES:

Input: "github.com"
Response: <page url="https://github.com">GitHub - Code hosting platform</page>

Input: "websites similar to slashdot but more modern"
Response:
<h2>Modern Tech Discussion Sites</h2>
<table>
Site,URL,Focus,Community Size,Key Features
Hacker News,https://news.ycombinator.com,Tech/Startup,Large,Voting system and thoughtful discussion
Lobsters,https://lobste.rs,Programming,Medium,Invitation-only with high quality
Reddit r/technology,https://reddit.com/r/technology,General Tech,Very Large,Broad tech coverage
Ars Technica,https://arstechnica.com,Tech News,Large,In-depth technical journalism
</table>
<page url="https://news.ycombinator.com">Hacker News - Most active and influential tech community</page>
<p>These sites offer more modern interfaces and active communities compared to Slashdot's older format. Hacker News is particularly recommended for startup and programming discussions.</p>

Input: "react hooks tutorial"
Response:
<h2>React Hooks Learning Resources</h2>
<page url="https://react.dev/reference/react">Official React Documentation - Hooks Reference</page>
<p>The official React documentation provides comprehensive coverage of all hooks with interactive examples.</p>

CONTEXT AWARENESS:
${
  context
    ? `
Recent URLs: ${context.recentUrls.join(", ")}
Current topics: ${context.currentTopics.join(", ")}
Preferred sources: ${context.userPreferences.preferredSources.join(", ")}
`
    : "No context provided."
}

Use web search when:
1. Input appears to be a search query
2. You need to verify if a URL exists
3. You need to find the best URL for a jump link
4. You need to get content preview information

Be intelligent about jump links - "gmail" should go to mail.google.com, "github" to github.com, etc.`;
  }

  /**
   * Build the user prompt
   */
  private buildUserPrompt(input: string, context?: DocumentContext): string {
    return `User input: "${input}"

Analyze this input and respond with appropriate XML blocks:

- If it's a direct URL or jump link, create a <page> block
- If it's a search query, create rich content with headings, tables, and page blocks
- Use web search when needed to find current, relevant information
- Always respond with XML tags, never JSON

Remember: You're creating content for a collaborative document editor, so make it useful and editable.`;
  }

  /**
   * Parse Claude's response and convert to ProcessingResult
   */
  private parseClaudeResponse(
    data: any,
    originalInput: string
  ): ProcessingResult {
    try {
      // Extract the text content from Claude's response
      let responseText = "";

      for (const content of data.content) {
        if (content.type === "text") {
          responseText += content.text;
        }
      }

      log.debug(
        `Claude response text: ${responseText}`,
        "IntelligentUrlService"
      );

      // Check if response contains XML tags
      const hasXMLTags = /<\w+[^>]*>[\s\S]*?<\/\w+>/.test(responseText);

      if (hasXMLTags) {
        // This is an XML response that should be exploded into blocks
        return {
          classification: "search_query", // Default for XML responses
          confidence: 0.9,
          action: "explode", // New action type for XML responses
          data: {
            xmlResponse: responseText,
            originalInput: originalInput,
          },
        };
      }

      // Check if it's a simple page response
      const pageMatch = responseText.match(
        /<page\s+url=["']([^"']+)["'][^>]*>(.*?)<\/page>/
      );
      if (pageMatch) {
        return {
          classification: "direct_url",
          confidence: 0.9,
          action: "navigate",
          data: {
            url: pageMatch[1],
            description: pageMatch[2].trim(),
          },
        };
      }

      // Fallback: treat as plain text
      return {
        classification: "ambiguous",
        confidence: 0.5,
        action: "clarify",
        data: {
          suggestions: [responseText],
        },
      };
    } catch (error) {
      log.debug(
        `Error parsing Claude response: ${error}`,
        "IntelligentUrlService"
      );
      return this.fallbackClassification(originalInput);
    }
  }

  /**
   * Fallback classification when LLM is unavailable
   */
  private fallbackClassification(input: string): ProcessingResult {
    const trimmed = input.trim().toLowerCase();

    // Check if it's a URL
    if (this.isValidUrl(input)) {
      return {
        classification: "direct_url",
        confidence: 0.9,
        action: "navigate",
        data: { url: this.formatUrl(input) },
      };
    }

    // Check for common jump links
    const jumpLinks: Record<string, string> = {
      gmail: "https://mail.google.com",
      github: "https://github.com",
      docs: "https://docs.google.com",
      drive: "https://drive.google.com",
      calendar: "https://calendar.google.com",
      youtube: "https://youtube.com",
      twitter: "https://twitter.com",
      linkedin: "https://linkedin.com",
    };

    if (jumpLinks[trimmed]) {
      return {
        classification: "jump_link",
        confidence: 0.8,
        action: "navigate",
        data: { url: jumpLinks[trimmed] },
      };
    }

    // If it contains spaces or looks like a search query
    if (trimmed.includes(" ") || trimmed.length > 50) {
      return {
        classification: "search_query",
        confidence: 0.7,
        action: "search",
        data: {
          suggestions: [`Search for "${input}"`],
        },
      };
    }

    // Default to ambiguous
    return {
      classification: "ambiguous",
      confidence: 0.3,
      action: "clarify",
      data: {
        suggestions: [
          `Navigate to ${input}`,
          `Search for "${input}"`,
          "Enter a valid URL",
        ],
      },
    };
  }

  /**
   * Validate if a string is a valid URL
   */
  private isValidUrl(input: string): boolean {
    try {
      // Try with https:// prefix if no protocol
      const urlToTest = input.match(/^[a-zA-Z]+:\/\//)
        ? input
        : `https://${input}`;
      new URL(urlToTest);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Format URL with proper protocol
   */
  private formatUrl(input: string): string {
    if (!input.match(/^[a-zA-Z]+:\/\//)) {
      return `https://${input}`;
    }
    return input;
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
