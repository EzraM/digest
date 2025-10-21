import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { site } from "../Browser/components/SiteBlock";
import {
  GoogleSearch,
  GoogleSearchExtensionName,
} from "../Search/GoogleSearchBlock";
import {
  ChatGPT,
  ChatGPTExtensionName,
} from "../Search/ChatGPTBlock";

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    site: site(),
    [GoogleSearchExtensionName]: GoogleSearch(),
    [ChatGPTExtensionName]: ChatGPT(),
  },
});

export type CustomBlockNoteEditor = typeof schema.BlockNoteEditor;
export type CustomBlock = typeof schema.Block;
export type CustomPartialBlock = typeof schema.PartialBlock;

export type CustomInlineContent = typeof schema.inlineContentSchema;
export type CustomStyle = typeof schema.styleSchema;

// Export the schema as default
export default schema;
