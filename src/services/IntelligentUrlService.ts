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
  action: "navigate" | "search" | "clarify" | "error";
  data?: {
    url?: string;
    searchResults?: SearchResult[];
    suggestions?: string[];
    preview?: ContentPreview;
    error?: string;
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
    return `You are an intelligent URL and search handler for a document editor. Your job is to analyze user input and determine the best action.

CLASSIFICATION TYPES:
- direct_url: Valid URLs that can be navigated to directly (e.g., "github.com", "https://example.com")
- jump_link: Shortcuts to common sites (e.g., "gmail", "docs", "github")
- search_query: Search terms that need web search (e.g., "react hooks tutorial", "best practices")
- ambiguous: Unclear intent that needs clarification
- invalid: Invalid or problematic input

ACTIONS:
- navigate: Go directly to a URL
- search: Perform web search and show results
- clarify: Ask for clarification
- error: Handle invalid input

RESPONSE FORMAT:
Always respond with a JSON object containing:
{
  "classification": "direct_url|jump_link|search_query|ambiguous|invalid",
  "confidence": 0.0-1.0,
  "action": "navigate|search|clarify|error",
  "reasoning": "Brief explanation of your decision",
  "data": {
    "url": "if navigating directly",
    "searchQuery": "if searching",
    "suggestions": ["array", "of", "suggestions"],
    "preview": {
      "title": "Content title",
      "description": "Brief description",
      "url": "final URL",
      "domain": "domain.com",
      "type": "article|documentation|tool|social|other",
      "keyPoints": ["key", "points", "from", "content"]
    }
  }
}

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
    return `Analyze this input and determine the best action: "${input}"

If this looks like a search query, use web search to find relevant results and provide a preview of the best option.
If this is a jump link (like "gmail" or "docs"), determine the correct URL.
If this is already a URL, validate it and provide a preview if possible.

Respond with the JSON format specified in the system prompt.`;
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

      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in Claude's response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        classification: parsed.classification || "ambiguous",
        confidence: parsed.confidence || 0.5,
        action: parsed.action || "clarify",
        data: parsed.data || {},
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
