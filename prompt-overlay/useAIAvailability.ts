import { useState, useEffect } from "react";
import { log } from "../src/utils/rendererLogger";

interface UseAIAvailabilityReturn {
  isAvailable: boolean;
  isLoading: boolean;
}

export const useAIAvailability = (): UseAIAvailabilityReturn => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAvailability = async () => {
      try {
        if ((window as any).electronAPI?.isIntelligentUrlAvailable) {
          const available = await (
            window as any
          ).electronAPI.isIntelligentUrlAvailable();
          setIsAvailable(available);
          log.debug(
            `Intelligent URL processing available: ${available}`,
            "prompt-overlay:useAIAvailability"
          );
        } else {
          setIsAvailable(false);
          log.debug(
            "electronAPI.isIntelligentUrlAvailable not found",
            "prompt-overlay:useAIAvailability"
          );
        }
      } catch (error) {
        log.debug(
          `Error checking AI availability: ${error}`,
          "prompt-overlay:useAIAvailability"
        );
        setIsAvailable(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAvailability();
  }, []);

  return {
    isAvailable,
    isLoading,
  };
};
