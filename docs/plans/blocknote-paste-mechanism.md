# BlockNote Paste Mechanism - How Styled Text Becomes Blocks

## Overview

This document explains how BlockNote converts styled HTML content (bold, italic, links, lists) from clipboard paste operations into BlockNote blocks with inline content.

## The Paste Flow

### 1. Paste Event Handling

When a paste event occurs, BlockNote's paste extension (`pasteExtension.ts`) intercepts it and calls the configured `pasteHandler`. The default handler:

1. Checks clipboard data types (blocknote/html, text/html, text/markdown, text/plain, Files)
2. Calls the appropriate paste method:
   - `editor.pasteHTML(data)` for HTML
   - `editor.pasteMarkdown(data)` for Markdown  
   - `editor.pasteText(data)` for plain text

### 2. HTML to Blocks Conversion

When `editor.pasteHTML(html)` is called:

```typescript
// ExportManager.pasteHTML()
public pasteHTML(html: string, raw = false) {
  let htmlToPaste = html;
  if (!raw) {
    // Convert HTML to BlockNote blocks
    const blocks = this.tryParseHTMLToBlocks(html);
    // Convert blocks back to BlockNote's internal HTML format
    htmlToPaste = this.blocksToFullHTML(blocks);
  }
  // Paste the converted HTML into ProseMirror
  this.editor.prosemirrorView?.pasteHTML(htmlToPaste);
}
```

The key conversion happens in `HTMLToBlocks()`:

```typescript
// parseHTML.ts
export function HTMLToBlocks(html: string, pmSchema: Schema) {
  // Preprocess nested lists to BlockNote structure
  const htmlNode = nestedListsToBlockNoteStructure(html);
  
  // Use ProseMirror's DOMParser with the schema
  const parser = DOMParser.fromSchema(pmSchema);
  const parentNode = parser.parse(htmlNode, {
    topNode: pmSchema.nodes["blockGroup"].create(),
  });
  
  // Convert ProseMirror nodes to BlockNote blocks
  const blocks = [];
  for (let i = 0; i < parentNode.childCount; i++) {
    blocks.push(nodeToBlock(parentNode.child(i), pmSchema));
  }
  return blocks;
}
```

### 3. ProseMirror Schema and parseDOM Rules

The magic happens in **ProseMirror's DOMParser**, which uses the schema's `parseDOM` rules to convert HTML elements into ProseMirror nodes and marks.

BlockNote uses **TipTap extensions** for default styles:
- `@tiptap/extension-bold` - handles `<strong>`, `<b>`, and `font-weight: bold`
- `@tiptap/extension-italic` - handles `<em>`, `<i>`, and `font-style: italic`
- `@tiptap/extension-link` - handles `<a href="...">` tags
- `@tiptap/extension-strike` - handles `<s>`, `<strike>`, `<del>`
- `@tiptap/extension-underline` - handles `<u>` tags
- `@tiptap/extension-code` - handles `<code>` tags

These TipTap extensions define `parseHTML()` methods that return parse rules. For example, Bold's parse rules:

```javascript
parseHTML() {
  return [
    { tag: 'strong' },
    { 
      tag: 'b',
      getAttrs: node => node.style.fontWeight !== 'normal' && null
    },
    {
      style: 'font-weight',
      getAttrs: value => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null
    }
  ]
}
```

### 4. ProseMirror Marks to BlockNote Inline Content

After ProseMirror parses the HTML into nodes with marks, BlockNote converts them to inline content in `contentNodeToInlineContent()`:

```typescript
// nodeToBlock.ts - contentNodeToInlineContent()
contentNode.content.forEach((node) => {
  // Extract styles from ProseMirror marks
  const styles: Styles<S> = {};
  let linkMark: Mark | undefined;
  
  for (const mark of node.marks) {
    if (mark.type.name === "link") {
      linkMark = mark; // Links are special - they become inline content, not styles
    } else {
      // Convert mark to style
      const config = styleSchema[mark.type.name];
      if (config.propSchema === "boolean") {
        styles[config.type] = true; // e.g., { bold: true }
      } else if (config.propSchema === "string") {
        styles[config.type] = mark.attrs.stringValue; // e.g., { textColor: "#ff0000" }
      }
    }
  }
  
  // Create inline content with styles
  if (linkMark) {
    // Links become { type: "link", href: "...", content: [...] }
  } else {
    // Text becomes { type: "text", text: "...", styles: { bold: true, italic: true } }
  }
});
```

### 5. List Handling

Lists get special preprocessing in `nestedListsToBlockNoteStructure()`:

1. **Lift nested lists**: Converts `<li><ul>...</ul></li>` to `<li></li><ul>...</ul>`
2. **Create block groups**: Wraps lists in BlockNote's block structure with `data-node-type="blockGroup"`

This ensures HTML lists (`<ul>`, `<ol>`) are converted to BlockNote's list block types (`bulletListItem`, `numberedListItem`).

## Key Insights for Electron Clipboard Integration

### Current Implementation

The digest project's `handleElectronPaste` currently:
1. Reads HTML/text from Electron clipboard
2. Calls `editor.pasteHTML(trimmedHtml)` directly

This **should** work the same way as the default paste handler, because:
- `pasteHTML()` goes through the same `HTMLToBlocks()` → `nodeToBlock()` → `contentNodeToInlineContent()` pipeline
- ProseMirror's DOMParser uses the same schema parseDOM rules
- TipTap marks handle the HTML element → ProseMirror mark conversion

### Potential Issues

1. **HTML Format**: The HTML from Electron clipboard might be structured differently than what browsers provide
   - Browsers often provide cleaned HTML via `event.clipboardData.getData("text/html")`
   - Electron clipboard might provide raw HTML with different structure

2. **Missing Styles**: If the HTML doesn't use standard tags (`<strong>`, `<em>`, `<a>`), the parseDOM rules won't match
   - Inline styles like `style="font-weight: bold"` should work (TipTap handles this)
   - But custom classes or non-standard markup won't be recognized

3. **List Structure**: Nested lists might not be in the expected format
   - The `nestedListsToBlockNoteStructure()` function should handle this, but edge cases might exist

### What Works vs. What Doesn't

**Should Work:**
- `<strong>bold</strong>` → `{ type: "text", text: "bold", styles: { bold: true } }`
- `<em>italic</em>` → `{ type: "text", text: "italic", styles: { italic: true } }`
- `<a href="...">link</a>` → `{ type: "link", href: "...", content: [...] }`
- `<ul><li>item</li></ul>` → `{ type: "bulletListItem", content: [...] }`
- Combined: `<strong><em>bold italic</em></strong>` → styles: `{ bold: true, italic: true }`

**Might Not Work:**
- Custom HTML attributes or classes
- Non-standard HTML structure
- CSS-based styling without corresponding HTML tags
- Complex nested structures that don't match BlockNote's expected format

## Next Steps

To fix the electron clipboard paste:

1. **Inspect the HTML format** from Electron clipboard to see what structure it provides
2. **Test with sample HTML** to verify which elements are being converted correctly
3. **Compare** the HTML from Electron clipboard vs. browser clipboard to identify differences
4. **Consider preprocessing** the HTML if needed to normalize it before calling `pasteHTML()`

The good news is that `editor.pasteHTML()` should handle most cases automatically through ProseMirror's schema parsing. The issue is likely in the HTML format or structure coming from the Electron clipboard.
