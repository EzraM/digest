import { useState, useEffect, useCallback } from "react";
import { log } from "../src/utils/rendererLogger";

interface CostData {
  queryCost: number;
  sessionTotal: number;
}

interface UseCostTrackingReturn {
  costData: CostData;
  hasCostData: boolean;
}

export const useCostTracking = (): UseCostTrackingReturn => {
  const [costData, setCostData] = useState<CostData>({
    queryCost: 0,
    sessionTotal: 0,
  });

  // Cost update handler
  const handleCostUpdate = useCallback((newCostData: CostData) => {
    log.debug(
      `Received cost update: ${JSON.stringify(newCostData)}`,
      "prompt-overlay:useCostTracking"
    );
    setCostData(newCostData);
  }, []);

  // Load initial cost data
  useEffect(() => {
    const loadInitialCostData = async () => {
      try {
        // Load initial cost data if available
        if ((window as any).electronAPI?.getCostSummary) {
          const initialCostData = await (
            window as any
          ).electronAPI.getCostSummary();
          setCostData(initialCostData);
          log.debug(
            `Loaded initial cost data: ${JSON.stringify(initialCostData)}`,
            "prompt-overlay:useCostTracking"
          );
        }
      } catch (error) {
        log.debug(
          `Error loading initial cost data: ${error}`,
          "prompt-overlay:useCostTracking"
        );
      }
    };

    loadInitialCostData();
  }, []);

  // Listen for cost updates from main process
  useEffect(() => {
    if ((window as any).electronAPI?.onCostUpdate) {
      return (window as any).electronAPI.onCostUpdate(handleCostUpdate);
    }
  }, [handleCostUpdate]);

  return {
    costData,
    hasCostData: costData.sessionTotal > 0,
  };
};
