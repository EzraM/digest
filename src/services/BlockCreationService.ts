import { log } from "../utils/mainLogger";
import {
  ResponseExploder,
  BlockCreationRequest,
  ExplodedResponse,
} from "./ResponseExploder";
import {
  IntelligentUrlService,
  ProcessingResult,
} from "./IntelligentUrlService";

/**
 * Service that handles the full pipeline from user input to block creation
 * This is the main orchestrator that:
 * 1. Takes user input
 * 2. Processes it through Claude
 * 3. Explodes XML responses into blocks
 * 4. Sends block creation requests to the renderer
 */
export class BlockCreationService {
  private intelligentUrlService: IntelligentUrlService;

  constructor() {
    this.intelligentUrlService = new IntelligentUrlService();
  }

  /**
   * Main entry point: process user input and create appropriate blocks
   */
  async processInputAndCreateBlocks(
    input: string,
    context?: any
  ): Promise<{
    success: boolean;
    blocks?: BlockCreationRequest[];
    error?: string;
    metadata?: any;
  }> {
    try {
      log.debug(
        `Processing input for block creation: "${input}"`,
        "BlockCreationService"
      );

      // Step 1: Process input through Claude
      const processingResult = await this.intelligentUrlService.processInput(
        input,
        context
      );

      log.debug(
        `Processing result: ${JSON.stringify(processingResult)}`,
        "BlockCreationService"
      );

      // Step 2: Handle different action types
      switch (processingResult.action) {
        case "navigate":
          // Simple navigation - create a single site block
          return {
            success: true,
            blocks: [
              {
                type: "site",
                props: {
                  url: processingResult.data?.url,
                },
              },
            ],
            metadata: {
              action: "navigate",
              originalInput: input,
            },
          };

        case "explode":
          // XML response - explode into multiple blocks
          if (processingResult.data?.xmlResponse) {
            const explodedResponse = ResponseExploder.explodeResponse(
              processingResult.data.xmlResponse,
              input
            );

            return {
              success: true,
              blocks: explodedResponse.blocks,
              metadata: {
                action: "explode",
                ...explodedResponse.metadata,
              },
            };
          } else {
            throw new Error("No XML response found for explode action");
          }

        case "clarify":
        case "search": {
          // Create a paragraph with suggestions
          const suggestions = processingResult.data?.suggestions || [
            "No suggestions available",
          ];
          return {
            success: true,
            blocks: [
              {
                type: "paragraph",
                content: `Suggestions for "${input}": ${suggestions.join(
                  ", "
                )}`,
              },
            ],
            metadata: {
              action: processingResult.action,
              originalInput: input,
            },
          };
        }

        case "error":
        default: {
          // Error case - create an error paragraph
          const errorMessage =
            processingResult.data?.error || "Unknown error occurred";
          return {
            success: true,
            blocks: [
              {
                type: "paragraph",
                content: `Error processing "${input}": ${errorMessage}`,
              },
            ],
            metadata: {
              action: "error",
              originalInput: input,
              error: errorMessage,
            },
          };
        }
      }
    } catch (error) {
      log.debug(
        `Error in block creation service: ${error}`,
        "BlockCreationService"
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          originalInput: input,
        },
      };
    }
  }

  /**
   * Check if intelligent processing is available
   */
  isIntelligentProcessingAvailable(): boolean {
    return this.intelligentUrlService.isAvailable();
  }
}
