import {
  createElement as h,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import useResizeObserver from "@react-hook/resize-observer";

export const site = createReactBlockSpec(
  {
    type: "site",
    propSchema: {},
    content: "none",
  },
  {
    render: (props) => {
      return h(Page, { blockId: props.block.id });
    },
  }
);

const useSize = (target) => {
  const [size, setSize] = useState();

  useLayoutEffect(() => {
    if (target?.current) {
      setSize(target.current.getBoundingClientRect());
    }
  }, [target.current]);

  useEffect(() => {
    const listener = () => {
      if (target?.current) {
        setSize(target.current.getBoundingClientRect());
      }
    };
    window.addEventListener("scroll", listener, false);
    return () => window.removeEventListener("scroll", listener);
  }, [target]);

  // update on resize
  //useResizeObserver(target, (entry) => setSize(entry.contentRect));
  return size;
};

export function Page({ blockId }) {
  const [state, dispatch] = useReducer(
    (state, action) => {
      switch (action.type) {
        case "set-url":
          return {
            status: "entry",
            url: action.url,
          };
        case "enter":
          return {
            status: "page",
            url: state.url,
          };
        default:
          return state;
      }
    },
    { status: "entry", url: "" }
  );

  const handleInput = (e) => {
    if (e.key === "Enter") {
      dispatch({ type: "enter" });
    }
  };

  useEffect(() => {
    window.electronAPI.updateBrowserUrl({ blockId, url: state.url });
  }, [blockId, state.status, state.url]);

  console.log(state);

  return h("div", {}, [
    state.status === "entry" &&
      h("input", {
        style: { height: 30, width: 500 },
        key: "locationBar",
        type: "text",
        value: state.url,
        onChange: (e) => dispatch({ type: "set-url", url: e.target.value }),
        onKeyPress: handleInput,
      }),
    state.status === "page" &&
      h(
        "div",
        {
          style: {
            border: "2px solid black",
            width: "calc(96vw - 118px)",
            height: 800,
          },
        },
        [h(BrowserSlot, { blockId })]
      ),
  ]);
}

function BrowserSlot({ blockId }) {
  const ref = useRef(null);
  const size = useSize(ref);

  useEffect(() => {
    if (size) {
      const { width, height, x, y } = size;
      const update = { bounds: { width, height, x, y }, blockId };
      window.electronAPI.updateBrowser(update);
    }
  }, [size, blockId]);

  return [
    h("div", {
      ref,
      style: {
        background: "#eee",
        width: "100%",
        height: "100%",
      },
    }),
  ];
}
