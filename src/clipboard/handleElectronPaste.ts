import { CustomBlockNoteEditor } from "../types/schema";

type PasteHandlerContext = {
  event: ClipboardEvent;
  editor: CustomBlockNoteEditor;
  defaultPasteHandler: (context?: {
    prioritizeMarkdownOverHTML?: boolean;
    plainTextAsMarkdown?: boolean;
  }) => boolean | undefined;
};

export const handleElectronPaste = ({
  event,
  editor,
  defaultPasteHandler,
}: PasteHandlerContext): boolean | undefined => {
  const clipboardApi = window.electronAPI?.clipboard;
  const eventTypes = Array.from(event.clipboardData?.types ?? []);

  // Keep BlockNote's built-in handling for its own format and files
  if (eventTypes.includes("blocknote/html") || eventTypes.includes("Files")) {
    return defaultPasteHandler();
  }

  const hasElectronClipboard =
    (clipboardApi?.availableFormats?.() ?? []).length > 0;

  if (hasElectronClipboard) {
    const html = clipboardApi.readHTML?.() ?? "";
    const text = clipboardApi.readText?.() ?? "";
    const trimmedHtml = html.trim();
    const trimmedText = text.trim();

    if (trimmedHtml) {
      editor.pasteHTML(trimmedHtml);
      return true;
    }

    if (trimmedText) {
      if (looksLikeMarkdown(trimmedText)) {
        editor.pasteMarkdown(trimmedText);
      } else {
        editor.pasteText(trimmedText);
      }
      return true;
    }
  }

  return defaultPasteHandler();
};

// Lightweight markdown detection, adapted from BlockNote's internal helper
const looksLikeMarkdown = (src: string): boolean => {
  const h1 = /(^|\n) {0,3}#{1,6} {1,8}[^\n]{1,64}\r?\n\r?\n\s{0,32}\S/;
  const bold =
    /(_|__|\*|\*\*|~~|==|\+\+)(?!\s)(?:[^\s](?:.{0,62}[^\s])?|\S)(?=\1)/;
  const link = /\[[^\]]{1,128}\]\(https?:\/\/\S{1,999}\)/;
  const code = /(?:\s|^)`(?!\s)(?:[^\s`](?:[^`]{0,46}[^\s`])?|[^\s`])`([^\w]|$)/;
  const ul = /(?:^|\n)\s{0,5}-\s{1}[^\n]+\n\s{0,15}-\s/;
  const ol = /(?:^|\n)\s{0,5}\d+\.\s{1}[^\n]+\n\s{0,15}\d+\.\s/;
  const hr = /\n{2} {0,3}-{2,48}\n{2}/;
  const fences =
    /(?:\n|^)(```|~~~|\$\$)(?!`|~)[^\s]{0,64} {0,64}[^\n]{0,64}\n[\s\S]{0,9999}?\s*\1 {0,64}(?:\n+|$)/;
  const title = /(?:\n|^)(?!\s)\w[^\n]{0,64}\r?\n(-|=)\1{0,64}\n\n\s{0,64}(\w|$)/;
  const blockquote =
    /(?:^|(\r?\n\r?\n))( {0,3}>[^\n]{1,333}\n){1,999}($|(\r?\n))/;
  const tableHeader = /^\s*\|(.+\|)+\s*$/m;
  const tableDivider = /^\s*\|(\s*[-:]+[-:]\s*\|)+\s*$/m;
  const tableRow = /^\s*\|(.+\|)+\s*$/m;

  return (
    h1.test(src) ||
    bold.test(src) ||
    link.test(src) ||
    code.test(src) ||
    ul.test(src) ||
    ol.test(src) ||
    hr.test(src) ||
    fences.test(src) ||
    title.test(src) ||
    blockquote.test(src) ||
    tableHeader.test(src) ||
    tableDivider.test(src) ||
    tableRow.test(src)
  );
};
