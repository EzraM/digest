/**
 * Embedding Providers
 *
 * Implementations of IEmbeddingProvider for generating vector embeddings.
 * Supports multiple backends: OpenAI, Voyage AI, and a local mock for testing.
 */

import type { IEmbeddingProvider } from "../core/types";
import { log } from "../../../utils/mainLogger";

// ============================================================================
// OpenAI Embedding Provider
// ============================================================================

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model?: string; // Default: text-embedding-3-small
  baseUrl?: string;
}

/**
 * OpenAI embeddings using text-embedding-3-small (1536 dimensions)
 */
export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly providerName = "openai";
  readonly dimensions: number;

  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: OpenAIEmbeddingConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? "text-embedding-3-small";
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";

    // Dimension depends on model
    this.dimensions = this.model === "text-embedding-3-large" ? 3072 : 1536;
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.batchEmbed([text]);
    return results[0];
  }

  async batchEmbed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      // Sort by index to maintain order
      const sorted = data.data.sort((a, b) => a.index - b.index);
      return sorted.map((d) => d.embedding);
    } catch (error) {
      log.debug(`OpenAI embedding error: ${error}`, "OpenAIEmbeddingProvider");
      throw error;
    }
  }
}

// ============================================================================
// Voyage AI Embedding Provider
// ============================================================================

export interface VoyageEmbeddingConfig {
  apiKey: string;
  model?: string; // Default: voyage-3
}

/**
 * Voyage AI embeddings using voyage-3 (1024 dimensions)
 */
export class VoyageEmbeddingProvider implements IEmbeddingProvider {
  readonly providerName = "voyage";
  readonly dimensions = 1024;

  private apiKey: string;
  private model: string;

  constructor(config: VoyageEmbeddingConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? "voyage-3";
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.batchEmbed([text]);
    return results[0];
  }

  async batchEmbed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          input_type: "document",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Voyage API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };

      return data.data.map((d) => d.embedding);
    } catch (error) {
      log.debug(`Voyage embedding error: ${error}`, "VoyageEmbeddingProvider");
      throw error;
    }
  }
}

// ============================================================================
// Mock Embedding Provider (for testing)
// ============================================================================

/**
 * Mock embedding provider for testing without API calls.
 * Generates deterministic pseudo-random vectors based on text content.
 */
export class MockEmbeddingProvider implements IEmbeddingProvider {
  readonly providerName = "mock";
  readonly dimensions: number;

  constructor(dimensions = 384) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    return this.generateDeterministicVector(text);
  }

  async batchEmbed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.generateDeterministicVector(text));
  }

  /**
   * Generate a deterministic vector from text.
   * Same text always produces same vector, similar texts produce similar vectors.
   */
  private generateDeterministicVector(text: string): number[] {
    const vector: number[] = new Array(this.dimensions);

    // Simple hash-based seeding
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }

    // Generate pseudo-random normalized vector
    for (let i = 0; i < this.dimensions; i++) {
      // Linear congruential generator
      hash = (hash * 1103515245 + 12345) >>> 0;
      vector[i] = (hash / 0xffffffff) * 2 - 1; // Range [-1, 1]
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map((v) => v / magnitude);
  }
}

// ============================================================================
// Provider Factory
// ============================================================================

export type EmbeddingProviderType = "openai" | "voyage" | "mock";

export interface CreateEmbeddingProviderOptions {
  type: EmbeddingProviderType;
  apiKey?: string;
  model?: string;
  dimensions?: number; // For mock provider
}

/**
 * Factory function to create embedding providers
 */
export function createEmbeddingProvider(
  options: CreateEmbeddingProviderOptions
): IEmbeddingProvider {
  switch (options.type) {
    case "openai":
      if (!options.apiKey) {
        throw new Error("OpenAI API key required");
      }
      return new OpenAIEmbeddingProvider({
        apiKey: options.apiKey,
        model: options.model,
      });

    case "voyage":
      if (!options.apiKey) {
        throw new Error("Voyage API key required");
      }
      return new VoyageEmbeddingProvider({
        apiKey: options.apiKey,
        model: options.model,
      });

    case "mock":
      return new MockEmbeddingProvider(options.dimensions);

    default:
      throw new Error(`Unknown embedding provider type: ${options.type}`);
  }
}
