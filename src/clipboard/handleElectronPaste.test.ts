import { handleElectronPaste } from "./handleElectronPaste";

describe("handleElectronPaste", () => {
  it("preserves indentation and line breaks when pasting plain text", () => {
    const source = "  function example() {\n    return true;\n  }\n";
    let pasted = "";

    (globalThis as any).window = {
      electronAPI: {
        clipboard: {
          availableFormats: () => ["text/plain"],
          readHTML: () => "",
          readText: () => source,
        },
      },
    };

    const handled = handleElectronPaste({
      event: {
        clipboardData: { types: ["text/plain"] },
      } as unknown as ClipboardEvent,
      editor: {
        pasteText: (text: string) => {
          pasted = text;
        },
      } as any,
      defaultPasteHandler: () => false,
    });

    expect(handled).toBe(true);
    expect(pasted).toBe(source);
  });
});
