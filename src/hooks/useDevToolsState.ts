import { useCallback, useEffect, useReducer } from "react";

type DevToolsState = {
  isAvailable: boolean;
  isOpen: boolean;
  isBusy: boolean;
};

type Action =
  | { type: "RESET" }
  | { type: "SET_UNAVAILABLE" }
  | { type: "SET_AVAILABLE"; isOpen: boolean }
  | { type: "START_TOGGLE" }
  | { type: "FINISH_TOGGLE"; isOpen: boolean }
  | { type: "END_TOGGLE_WITH_ERROR" };

const initialState: DevToolsState = {
  isAvailable: false,
  isOpen: false,
  isBusy: false,
};

function reducer(state: DevToolsState, action: Action): DevToolsState {
  switch (action.type) {
    case "RESET":
      return initialState;
    case "SET_UNAVAILABLE":
      return {
        ...initialState,
        isAvailable: false,
      };
    case "SET_AVAILABLE":
      return {
        isAvailable: true,
        isOpen: action.isOpen,
        isBusy: false,
      };
    case "START_TOGGLE":
      return {
        ...state,
        isBusy: true,
      };
    case "FINISH_TOGGLE":
      return {
        ...state,
        isOpen: action.isOpen,
        isBusy: false,
      };
    case "END_TOGGLE_WITH_ERROR":
      return {
        ...state,
        isBusy: false,
      };
    default:
      return state;
  }
}

export function useDevToolsState(blockId: string) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let isSubscribed = true;

    dispatch({ type: "RESET" });

    const browserApi = window.electronAPI?.browser;
    if (!browserApi) {
      dispatch({ type: "SET_UNAVAILABLE" });
      return () => {
        isSubscribed = false;
      };
    }

    browserApi
      .getDevToolsState(blockId)
      .then((result) => {
        if (!isSubscribed) {
          return;
        }

        if (result?.success) {
          dispatch({ type: "SET_AVAILABLE", isOpen: result.isOpen });
        } else {
          dispatch({ type: "SET_AVAILABLE", isOpen: false });
        }
      })
      .catch((error) => {
        if (isSubscribed) {
          console.error(
            `Failed to fetch DevTools state for block ${blockId}:`,
            error
          );
          dispatch({ type: "SET_AVAILABLE", isOpen: false });
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [blockId]);

  const toggleDevTools = useCallback(async () => {
    const browserApi = window.electronAPI?.browser;
    if (!browserApi) {
      dispatch({ type: "SET_UNAVAILABLE" });
      return;
    }

    if (state.isBusy) {
      return;
    }

    dispatch({ type: "START_TOGGLE" });

    try {
      const result = await browserApi.toggleDevTools(blockId);
      if (result?.success) {
        dispatch({ type: "FINISH_TOGGLE", isOpen: result.isOpen });
        return;
      }

      if (result?.error) {
        console.error(
          `Failed to toggle DevTools for block ${blockId}: ${result.error}`
        );
      }

      dispatch({ type: "END_TOGGLE_WITH_ERROR" });
    } catch (error) {
      console.error(
        `Unexpected error while toggling DevTools for block ${blockId}:`,
        error
      );
      dispatch({ type: "END_TOGGLE_WITH_ERROR" });
    }
  }, [blockId, state.isBusy]);

  return {
    ...state,
    toggleDevTools,
  };
}
