/**
 * Convert a URL and title to BlockNote inline content format
 * Creates inline content with a clickable link
 * Returns an array compatible with BlockNote's inline content schema
 */
export function createClipReferenceInlineContent(
  sourceUrl: string,
  title?: string
): Array<{
  type: "text" | "link";
  text?: string;
  styles?: Record<string, unknown>;
  href?: string;
  content?: Array<{
    type: "text";
    text: string;
    styles?: Record<string, unknown>;
  }>;
}> {
  const linkText = title || sourceUrl || "Unknown source";

  return [
    {
      type: "link",
      href: sourceUrl || "",
      content: [
        {
          type: "text",
          text: linkText,
          styles: {},
        },
      ],
    },
  ];
}

