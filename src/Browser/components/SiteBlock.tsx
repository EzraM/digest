import React from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Page } from "./Page";

export const site = createReactBlockSpec(
  {
    type: "site",
    propSchema: {url: { default: "" }},
    content: "none",
  },
  {
    render: (props) => <Page blockId={props.block.id} url={props.block.props.url} />,
  }
); 