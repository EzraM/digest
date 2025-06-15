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
    this.intelligentUrlService = IntelligentUrlService.getInstance();
  }

  /**
   * Main entry point: process user input and create appropriate blocks
   */
  async processInputAndCreateBlocks(input: string): Promise<{
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

      // Step 1: Process input through Claude (always returns XML to explode)
      const processingResult = await this.intelligentUrlService.processInput(
        input
      );

      log.debug(
        `Processing result: ${JSON.stringify(processingResult)}`,
        "BlockCreationService"
      );

      // Step 2: Handle the result
      if (!processingResult.success) {
        return {
          success: false,
          error: processingResult.error || "Unknown error occurred",
          metadata: {
            originalInput: input,
          },
        };
      }

      // Step 3: Explode XML response into blocks
      if (processingResult.xmlResponse) {
        const explodedResponse = ResponseExploder.explodeResponse(
          processingResult.xmlResponse,
          input
        );

        const result = {
          success: true,
          blocks: explodedResponse.blocks,
          metadata: {
            action: "explode",
            ...explodedResponse.metadata,
          },
        };

        log.debug(
          `Final block creation result: ${JSON.stringify(result, null, 2)}`,
          "BlockCreationService"
        );

        return result;
      } else {
        throw new Error("No XML response found");
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
