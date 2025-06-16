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

  public async processInput(input: string): Promise<ProcessingResult> {
    try {
      // Handle empty input
      if (!input.trim()) {
        return {
          success: false,
          error: "Please enter a URL or describe what you're looking for",
        };
      }

      // Handle direct URLs - create a simple page block
      if (this.isDirectUrl(input)) {
        return {
          success: true,
          xmlResponse: `<page url="${input}"></page>`,
        };
      }

      const systemPrompt = `You are an intelligent assistant that helps users create structured content blocks for a collaborative document. Users will provide input describing what they want to research, compare, or explore.

Your job is to respond with XML that will be converted into document blocks. Use these XML tags:

<page url="https://example.com">
For specific websites or services that should be navigated to directly.
</page>

<table>
Create comparison tables with headers and data rows. Always include a URL column when comparing websites/services.
Use simple CSV format inside the table tags.
Example:
<table>
Site,URL,Focus,Community Size,Key Features
Hacker News,https://news.ycombinator.com,Tech/Startup,Large,Voting system
Reddit,https://reddit.com,General,Very Large,Subreddits
</table>

<h1>, <h2>, <h3>
For section headings.
Example: <h2>Social Media Platforms</h2>

<p>
For explanatory text or descriptions.
Example: <p>Here are the top social media platforms for developers:</p>

<image url="https://example.com/image.jpg" alt="Description">
For relevant images.
</image>

<list>
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

Guidelines:
- Prioritize single <page> responses for clear service name requests
- For comparisons, you can make tables with URL columns
- Include 3-5 relevant options when comparing
- Add brief explanatory text with <p> tags when providing information
- Use appropriate headings to organize content
- When mentioning specific sites, include their URLs
- Keep responses focused and actionable

Respond ONLY with XML tags. Do not include any other text or explanations.`;

      const userPrompt = `${input}`;

      const response = await this.callAnthropic(
        `${systemPrompt}\n\nUser request: ${userPrompt}`
      );

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
