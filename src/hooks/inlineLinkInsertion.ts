import type {
  CustomPartialBlock,
} from "../types/schema";

export type InlineLinkInsertion = {
  url: string;
  title: string;
  sourceBlockId?: string;
};

export const createInlineLinkBlock = (
  data: InlineLinkInsertion
): CustomPartialBlock =>
  ({
    type: "paragraph",
    content: [
      {
        type: "link",
        href: data.url,
        content: [
          {
            type: "text",
            text: data.title,
            styles: {},
          },
        ],
      },
    ],
  }) as unknown as CustomPartialBlock;
