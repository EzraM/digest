import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { site } from "../Browser/components/SiteBlock";

// Create our custom schema with proper typing
export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    site: site,
  },
});

// Export properly typed versions of BlockNote types
export type CustomBlockNoteEditor = typeof schema.BlockNoteEditor;
export type CustomBlock = typeof schema.Block;
export type CustomPartialBlock = typeof schema.PartialBlock;

// Export the schema as default
export default schema;
