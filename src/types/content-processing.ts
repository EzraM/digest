/**
 * Content Processing Types
 *
 * These types define the clean boundary between content processing services
 * and the rest of the application. This allows for pluggable implementations
 * in the future.
 */

// Tools that can be used by content processing services
export interface DocumentAnalysisTool {
  analyzeDocument(document: any[]): DocumentContext;
}

export interface WebSearchTool {
  search(query: string): Promise<SearchResult[]>;
}

export interface ContentFetchTool {
  fetch(url: string): Promise<ContentPreview>;
}

// Available tools for content processing
export interface AvailableTools {
  documentAnalysis?: DocumentAnalysisTool;
  webSearch?: WebSearchTool;
  contentFetch?: ContentFetchTool;
}

// Input for content processing
export interface ProcessingRequest {
  input: string;
  documentContext?: DocumentContext;
  availableTools?: AvailableTools;
  requestId?: string;
}

// Output from content processing - pure data, no business logic
export interface ProcessingResult {
  success: boolean;
  blockOperations?: BlockChangeSet;
  error?: string;
  metadata?: ProcessingMetadata;
}

// Block operations as pure data
export interface BlockChangeSet {
  operations: BlockChange[];
  batchId?: string;
  source: 'ai' | 'user' | 'system';
}

export interface BlockChange {
  type: 'insert' | 'update' | 'delete' | 'move';
  blockId?: string; // undefined for inserts
  position?: number;
  content?: any; // block content
}

// Metadata about processing
export interface ProcessingMetadata {
  cost?: number;
  duration?: number;
  webSearches?: number;
  tokensUsed?: number;
  model?: string;
}

// Document context for processing
export interface DocumentContext {
  blocks: any[];
  blockCount: number;
  recentUrls: string[];
  currentTopics: string[];
  userPreferences: {
    preferredSources: string[];
    blockedDomains: string[];
  };
  timestamp: number;
}

// Search and content types
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

// Content processing service interface
export interface ContentProcessor {
  isAvailable(): boolean;
  processRequest(request: ProcessingRequest): Promise<ProcessingResult>;
  getCostSummary(): { queryCost: number; sessionTotal: number };
}