import { log } from "../utils/rendererLogger";

// Re-export types from the main process service
export type SiteBlockStatus =
  | "entry" // Initial input state
  | "processing" // LLM is analyzing the input
  | "page" // Direct URL navigation
  | "preview" // Minimized preview with expand option
  | "search_results" // Search results with selection options
  | "error"; // Error state

export type InputClassification =
  | "direct_url" // Valid URL that can be navigated to directly
  | "jump_link" // Shortcut like "gmail", "github", "docs"
  | "search_query" // Search terms that need web search
  | "ambiguous" // Unclear intent, needs clarification
  | "invalid"; // Invalid or problematic input

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

/**
 * Renderer-side intelligent URL handler that communicates with main process via IPC
 */
export class IntelligentUrlHandler {
  /**
   * Check if intelligent processing is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!window.electronAPI?.isIntelligentUrlAvailable) {
        log.debug(
          "Electron API not available for intelligent URL processing",
          "IntelligentUrlHandler"
        );
        return false;
      }

      const available = await window.electronAPI.isIntelligentUrlAvailable();
      log.debug(
        `Intelligent URL processing available: ${available}`,
        "IntelligentUrlHandler"
      );
      return available;
    } catch (error) {
      log.debug(
        `Error checking intelligent URL availability: ${error}`,
        "IntelligentUrlHandler"
      );
      return false;
    }
  }

  /**
   * Process user input using the main process service
   */
  async processInput(
    input: string,
    context?: DocumentContext
  ): Promise<ProcessingResult> {
    try {
      log.debug(
        `Processing input via IPC: "${input}"`,
        "IntelligentUrlHandler"
      );

      if (!window.electronAPI?.processIntelligentUrl) {
        throw new Error(
          "Electron API not available for intelligent URL processing"
        );
      }

      const result = await window.electronAPI.processIntelligentUrl(
        input,
        context
      );
      log.debug(
        `IPC processing result: ${JSON.stringify(result)}`,
        "IntelligentUrlHandler"
      );

      return result;
    } catch (error) {
      log.debug(
        `Error processing input via IPC: ${error}`,
        "IntelligentUrlHandler"
      );

      // Return error result
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

  /**
   * Basic URL validation for immediate feedback
   */
  static isValidUrl(input: string): boolean {
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
  static formatUrl(input: string): string {
    if (!input.match(/^[a-zA-Z]+:\/\//)) {
      return `https://${input}`;
    }
    return input;
  }
}
