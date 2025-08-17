import { log } from "../utils/mainLogger";
import { getAnthropicApiKey } from "../config/development";
import { getEventLogger } from "./EventLogger";
import { XmlResponseParser } from "./XmlResponseParser";
import {
  ContentProcessor,
  ProcessingRequest,
  ProcessingResult,
  BlockChangeSet,
  BlockChange,
  DocumentContext,
  ProcessingMetadata,
  AvailableTools
} from "../types/content-processing";

// Cost tracking interface
interface QueryCost {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  webSearches: number;
  totalCostUSD: number;
}

/**
 * Pluggable content processor using Claude API
 * Implements the ContentProcessor interface for clean separation
 */
export class ClaudeContentProcessor implements ContentProcessor {
  private anthropicApiKey: string | null = null;
  private sessionTotalCost = 0;
  private lastQueryCost = 0;
  private _eventLogger: ReturnType<typeof getEventLogger> | null = null;
  private xmlParser: XmlResponseParser;

  // Claude Sonnet 4 pricing (as of 2025)
  private static readonly PRICING = {
    INPUT_TOKENS_PER_MILLION: 3.0,
    OUTPUT_TOKENS_PER_MILLION: 15.0,
    WEB_SEARCHES_PER_THOUSAND: 10.0,
  };

  private get eventLogger() {
    if (!this._eventLogger) {
      this._eventLogger = getEventLogger();
    }
    return this._eventLogger;
  }

  constructor() {
    this.anthropicApiKey = getAnthropicApiKey();
    this.xmlParser = new XmlResponseParser();
  }

  public isAvailable(): boolean {
    return this.anthropicApiKey !== null;
  }

  public getCostSummary(): { queryCost: number; sessionTotal: number } {
    return {
      queryCost: this.lastQueryCost,
      sessionTotal: this.sessionTotalCost,
    };
  }

  public async processRequest(request: ProcessingRequest): Promise<ProcessingResult> {
    const requestId = request.requestId || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      // Event: Processing started
      this.eventLogger.logSystemEvent('content:processing-started', {
        input: request.input,
        hasDocumentContext: !!request.documentContext
      }, {
        requestId,
        source: 'ClaudeContentProcessor'
      });

      // Log user prompt event
      this.eventLogger.logUserPrompt(
        request.input, 
        request.documentContext ? JSON.stringify(request.documentContext) : undefined, 
        {
          requestId,
          source: 'ClaudeContentProcessor.processRequest'
        }
      );

      // Handle empty input
      if (!request.input.trim()) {
        return {
          success: false,
          error: "Please describe what you're looking for, or enter a url",
        };
      }

      // Handle direct URLs - create a simple page block
      if (this.isDirectUrl(request.input)) {
        this.eventLogger.logSystemEvent('content:direct-url-detected', {
          url: request.input
        }, {
          requestId,
          source: 'ClaudeContentProcessor'
        });

        const blockChange: BlockChange = {
          type: 'insert',
          content: {
            id: `page-${Date.now()}`,
            type: 'site',
            props: { url: request.input }
          }
        };

        const changeSet: BlockChangeSet = {
          operations: [blockChange],
          source: 'ai',
          batchId: `direct-url-${Date.now()}`
        };

        return {
          success: true,
          blockOperations: changeSet,
        };
      }

      // Event: Model call starting
      this.eventLogger.logSystemEvent('content:model-call-starting', {}, {
        requestId,
        source: 'ClaudeContentProcessor'
      });

      // Process with Claude API
      const xmlResponse = await this.callClaude(request, requestId);
      
      // Event: Response received
      this.eventLogger.logSystemEvent('content:response-received', {
        responseLength: xmlResponse.length
      }, {
        requestId,
        source: 'ClaudeContentProcessor'
      });

      // Event: Parsing started
      this.eventLogger.logSystemEvent('content:parsing-started', {}, {
        requestId,
        source: 'ClaudeContentProcessor'
      });

      // Convert XML to block operations
      const blockOperations = await this.parseXmlToBlockOperations(xmlResponse, requestId);

      // Event: Operations ready
      this.eventLogger.logSystemEvent('content:operations-ready', {
        operationCount: blockOperations?.operations?.length || 0
      }, {
        requestId,
        source: 'ClaudeContentProcessor'
      });

      const duration = Date.now() - startTime;

      return {
        success: true,
        blockOperations,
        metadata: {
          cost: this.lastQueryCost,
          duration,
          model: 'claude-sonnet-4'
        }
      };
    } catch (error) {
      // Event: Processing failed
      this.eventLogger.logSystemEvent('content:processing-failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, {
        requestId,
        source: 'ClaudeContentProcessor'
      });

      log.debug(`Error processing request: ${error}`, "ClaudeContentProcessor");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  private isDirectUrl(input: string): boolean {
    try {
      const url = new URL(input);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  private async callClaude(request: ProcessingRequest, requestId: string): Promise<string> {
    if (!this.anthropicApiKey) {
      throw new Error("Anthropic API key not available");
    }

    const prompt = this.buildPrompt(request);

    const requestBody = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 10,
        },
      ],
    };

    const startTime = Date.now();

    // Log the model call event
    this.eventLogger.logModelCall(
      "System prompt embedded in user content", 
      prompt,
      requestBody,
      { 
        requestId, 
        timing: { startTime },
        source: 'ClaudeContentProcessor'
      }
    );

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const data = await response.json();
    const endTime = Date.now();

    // Calculate and track costs
    if (data.usage) {
      this.trackCosts(data.usage, requestId, startTime, endTime, data);
    }

    return this.extractResponseText(data);
  }

  private buildPrompt(request: ProcessingRequest): string {
    let documentContextSection = "";
    
    if (request.documentContext && request.documentContext.blocks.length > 0) {
      const docSummary = this.summarizeDocument(request.documentContext.blocks);
      documentContextSection = `
DOCUMENT CONTEXT:
The user is working on a document that currently contains ${request.documentContext.blockCount} blocks. Here's the current content in XML format:

${docSummary}

Please consider this existing content when generating your response. Look for opportunities to:
- **enrich** existing blocks with missing details, better structure, or refined insights
- **connect** new information to existing themes and topics
- **compress** multiple related ideas into cohesive, dense understanding

To UPDATE existing blocks: copy their exact blockId attribute
To CREATE new blocks: omit the blockId attribute
`;
    }

    const systemPrompt = `You are a curious and fastidious friend helping with Digest - a document editor designed to compress and refine information gathered while exploring the internet.

${documentContextSection}

Your job is to respond with XML that will be converted into document blocks. Use these XML tags:

<page url="https://example.com" blockId="optional-block-id">
For specific websites or services that should be navigated to directly.
</page>

<table blockId="optional-block-id">
Create comparison tables with headers and data rows. Always include a URL column when comparing websites/services.
Use simple CSV format inside the table tags.
</table>

<h1 blockId="optional-block-id">, <h2 blockId="optional-block-id">, <h3 blockId="optional-block-id">
For section headings.
</h1>, </h2>, </h3>

<p blockId="optional-block-id">
For explanatory text or descriptions.
</p>

<image url="https://example.com/image.jpg" alt="Description" blockId="optional-block-id">
For relevant images.
</image>

<list blockId="optional-block-id">
<item>First item</item>
<item>Second item</item>
</list>

CRITICAL RULES:
- NEVER nest <page> tags inside other tags
- NEVER hallucinate URLs - only use URLs from web search results
- For single service names (like "gmail"), respond with just <page url="https://gmail.com"></page>
- Search first for specific products/services to get current information

Respond ONLY with XML tags. Do not include any other text or explanations.`;

    return `${systemPrompt}\n\nUser request: ${request.input}`;
  }

  private trackCosts(usage: any, requestId: string, startTime: number, endTime: number, responseData: any): void {
    const queryCost = this.calculateQueryCost(usage);
    this.lastQueryCost = queryCost.totalCostUSD;
    this.sessionTotalCost += queryCost.totalCostUSD;

    // Log the model response event
    const responseText = this.extractResponseText(responseData);
    this.eventLogger.logModelResponse(
      responseText,
      usage,
      {
        requestId,
        cost: queryCost.totalCostUSD,
        tokens: queryCost.inputTokens + queryCost.outputTokens,
        timing: {
          startTime,
          endTime,
          duration: endTime - startTime
        },
        webSearches: queryCost.webSearches,
        source: 'ClaudeContentProcessor'
      }
    );

    log.debug(
      `Query cost: $${queryCost.totalCostUSD.toFixed(6)}, Session total: $${this.sessionTotalCost.toFixed(6)}`,
      "ClaudeContentProcessor"
    );
  }

  private calculateQueryCost(usage: any): QueryCost {
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheReadTokens = usage.cache_read_input_tokens || 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
    const webSearches = usage.server_tool_use?.web_search_requests || 0;

    const inputCost = (inputTokens / 1_000_000) * ClaudeContentProcessor.PRICING.INPUT_TOKENS_PER_MILLION;
    const outputCost = (outputTokens / 1_000_000) * ClaudeContentProcessor.PRICING.OUTPUT_TOKENS_PER_MILLION;
    const webSearchCost = (webSearches / 1_000) * ClaudeContentProcessor.PRICING.WEB_SEARCHES_PER_THOUSAND;
    const cacheCreationCost = (cacheCreationTokens / 1_000_000) * ClaudeContentProcessor.PRICING.INPUT_TOKENS_PER_MILLION;

    return {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      webSearches,
      totalCostUSD: inputCost + outputCost + webSearchCost + cacheCreationCost,
    };
  }

  private extractResponseText(data: any): string {
    const textBlocks = data.content.filter((block: any) => block.type === "text");

    if (textBlocks.length === 0) {
      throw new Error("No text content found in Claude's response");
    }

    const allText = textBlocks
      .map((block: any) => block.text)
      .filter((text: string) => {
        // Skip short search announcements
        if (text.length < 50 && (text.includes("search") || text.includes("I'll") || text.includes("Let me"))) {
          return false;
        }
        return true;
      })
      .join(" ");

    return allText.trim() || textBlocks[textBlocks.length - 1].text;
  }

  private async parseXmlToBlockOperations(xmlResponse: string, requestId: string): Promise<BlockChangeSet> {
    try {
      log.debug("=== XML RESPONSE START ===", "ClaudeContentProcessor");
      log.debug(xmlResponse, "ClaudeContentProcessor");
      log.debug("=== XML RESPONSE END ===", "ClaudeContentProcessor");

      // Use separate XML parser
      const blockRequests = await this.xmlParser.parseXmlResponse(xmlResponse, requestId);

      // Convert BlockCreationRequests to BlockChanges
      const operations: BlockChange[] = blockRequests.map(request => ({
        type: request.blockId ? 'update' : 'insert',
        blockId: request.blockId,
        content: {
          id: request.blockId || `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: request.type,
          props: request.props,
          content: request.content
        }
      }));

      return {
        operations,
        source: 'ai',
        batchId: `claude-batch-${Date.now()}`
      };
    } catch (error) {
      this.eventLogger.logSystemEvent('content:xml-parsing-failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, {
        requestId,
        source: 'ClaudeContentProcessor'
      });

      // Fallback: create a single paragraph with the raw response
      log.debug(`Error parsing XML response: ${error}`, "ClaudeContentProcessor");
      
      const fallbackOperation: BlockChange = {
        type: 'insert',
        content: {
          id: `fallback-${Date.now()}`,
          type: 'paragraph',
          content: xmlResponse
        }
      };

      return {
        operations: [fallbackOperation],
        source: 'ai',
        batchId: `claude-fallback-${Date.now()}`
      };
    }
  }

  private summarizeDocument(blocks: any[]): string {
    try {
      const xmlBlocks: string[] = [];

      for (const block of blocks) {
        const blockId = block.id || "no-id";

        if (block.type === "heading") {
          const level = block.props?.level || 1;
          const text = this.extractTextContent(block.content);
          if (text.trim()) {
            xmlBlocks.push(`<h${level} blockId="${blockId}">${text}</h${level}>`);
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
        }
      }

      return xmlBlocks.join("\n\n");
    } catch (error) {
      log.debug(`Error summarizing document: ${error}`, "ClaudeContentProcessor");
      return "Unable to summarize document content";
    }
  }

  private extractTextContent(content: any): string {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === "string") return item;
          if (item.type === "text") return item.text || "";
          if (item.type === "link") return this.extractTextContent(item.content);
          return "";
        })
        .join("");
    }
    if (content.text) return content.text;
    return "";
  }
}