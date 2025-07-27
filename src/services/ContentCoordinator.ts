import { log } from "../utils/mainLogger";
import { WebContentsView } from "electron";
import { BlockEventManager } from "./BlockEventManager";
import { ClaudeContentProcessor } from "./ContentProcessorService";
import { ResponseExploder } from "./ResponseExploder";
import {
  ContentProcessor,
  ProcessingRequest,
  ProcessingResult,
  DocumentContext,
  BlockChangeSet
} from "../types/content-processing";

/**
 * Main coordinator for content processing and block operations
 * Orchestrates the interaction between AI content processing and block management
 */
export class ContentCoordinator {
  private static instance: ContentCoordinator;
  private blockEventManager: BlockEventManager;
  private contentProcessor: ContentProcessor;
  private responseExploder: ResponseExploder;
  private promptOverlayWebContents: WebContentsView | null = null;

  private constructor() {
    this.blockEventManager = BlockEventManager.getInstance();
    this.contentProcessor = new ClaudeContentProcessor();
    this.responseExploder = new ResponseExploder();
    this.setupEventHandlers();
  }

  public static getInstance(): ContentCoordinator {
    if (!ContentCoordinator.instance) {
      ContentCoordinator.instance = new ContentCoordinator();
    }
    return ContentCoordinator.instance;
  }

  private setupEventHandlers(): void {
    // Listen for AI block applications to emit cost updates
    this.blockEventManager.on('ai:blocks-applied', (event) => {
      this.emitCostUpdate();
      log.debug(`AI blocks applied for request ${event.requestId}`, 'ContentCoordinator');
    });
  }

  /**
   * Process user input and create blocks
   */
  async processInput(input: string, documentContext?: DocumentContext): Promise<ProcessingResult> {
    const requestId = `coord-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      log.debug(`Processing input: "${input}"`, 'ContentCoordinator');

      if (!this.contentProcessor.isAvailable()) {
        return {
          success: false,
          error: "Content processing service not available"
        };
      }

      // Create processing request
      const request: ProcessingRequest = {
        input,
        documentContext,
        requestId
      };

      // Process with content processor
      const result = await this.contentProcessor.processRequest(request);

      if (!result.success || !result.blockOperations) {
        return result;
      }

      // Handle XML response if present (for backward compatibility)
      if (this.isXmlResponse(result.blockOperations)) {
        return await this.handleXmlResponse(result.blockOperations, requestId);
      }

      // Apply block operations via event system
      this.blockEventManager.suggestBlocks(result.blockOperations, requestId);

      return {
        success: true,
        blockOperations: result.blockOperations,
        metadata: result.metadata
      };

    } catch (error) {
      log.debug(`Error in content coordinator: ${error}`, 'ContentCoordinator');
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Check if content processor is available
   */
  isAvailable(): boolean {
    return this.contentProcessor.isAvailable();
  }

  /**
   * Get cost summary from content processor
   */
  getCostSummary(): { queryCost: number; sessionTotal: number } {
    return this.contentProcessor.getCostSummary();
  }

  /**
   * Set prompt overlay web contents for cost updates
   */
  setPromptOverlayWebContents(webContents: WebContentsView | null): void {
    this.promptOverlayWebContents = webContents;
  }

  /**
   * Set renderer web contents for block updates
   */
  setRendererWebContents(webContents: WebContentsView): void {
    this.blockEventManager.setRendererWebContents(webContents);
  }

  private isXmlResponse(blockOperations: BlockChangeSet): boolean {
    // Check if this is a legacy XML response that needs to be parsed
    return blockOperations.operations.length === 1 && 
           blockOperations.operations[0].content?.type === 'xml-response';
  }

  private async handleXmlResponse(blockOperations: BlockChangeSet, requestId: string): Promise<ProcessingResult> {
    try {
      const xmlData = blockOperations.operations[0].content.xmlData;
      
      log.debug("Handling legacy XML response through ResponseExploder", 'ContentCoordinator');

      // Use ResponseExploder to parse XML into block creation requests
      const blockCreationResult = await this.responseExploder.explodeXmlResponse(xmlData);

      if (!blockCreationResult.success || !blockCreationResult.blocks) {
        return {
          success: false,
          error: blockCreationResult.error || "Failed to parse XML response"
        };
      }

      // Convert block creation requests to block operations
      const changeSet: BlockChangeSet = {
        operations: blockCreationResult.blocks.map(blockRequest => ({
          type: 'insert' as const,
          content: blockRequest.block,
          position: blockRequest.position
        })),
        source: 'ai',
        batchId: `xml-parsed-${Date.now()}`
      };

      // Apply via event system
      this.blockEventManager.suggestBlocks(changeSet, requestId);

      return {
        success: true,
        blockOperations: changeSet,
        metadata: {
          cost: this.contentProcessor.getCostSummary().queryCost
        }
      };

    } catch (error) {
      log.debug(`Error handling XML response: ${error}`, 'ContentCoordinator');
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process XML response"
      };
    }
  }

  private emitCostUpdate(): void {
    if (this.promptOverlayWebContents && !this.promptOverlayWebContents.webContents.isDestroyed()) {
      const costData = this.contentProcessor.getCostSummary();
      this.promptOverlayWebContents.webContents.send("cost-update", costData);
      log.debug(
        `Emitted cost update: ${JSON.stringify(costData)}`,
        "ContentCoordinator"
      );
    }
  }
}