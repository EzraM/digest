/* Shiki publishes language modules through its package export map. Vite
 * resolves them correctly; the repository's legacy Node resolver does not. */
/* eslint-disable import/no-unresolved */
import { createCodeBlockSpec } from "@blocknote/core";
import { createBundledHighlighter } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import type {
  DynamicImportLanguageRegistration,
  DynamicImportThemeRegistration,
} from "@shikijs/types";
import { alabasterTheme } from "./alabasterTheme";

const languages = {
  bash: () => import("@shikijs/langs-precompiled/shellscript"),
  c: () => import("@shikijs/langs-precompiled/c"),
  cpp: () => import("@shikijs/langs-precompiled/cpp"),
  css: () => import("@shikijs/langs-precompiled/css"),
  go: () => import("@shikijs/langs-precompiled/go"),
  html: () => import("@shikijs/langs-precompiled/html"),
  java: () => import("@shikijs/langs-precompiled/java"),
  javascript: () => import("@shikijs/langs-precompiled/javascript"),
  json: () => import("@shikijs/langs-precompiled/json"),
  jsx: () => import("@shikijs/langs-precompiled/jsx"),
  markdown: () => import("@shikijs/langs-precompiled/markdown"),
  python: () => import("@shikijs/langs-precompiled/python"),
  ruby: () => import("@shikijs/langs-precompiled/ruby"),
  rust: () => import("@shikijs/langs-precompiled/rust"),
  sql: () => import("@shikijs/langs-precompiled/sql"),
  swift: () => import("@shikijs/langs-precompiled/swift"),
  tsx: () => import("@shikijs/langs-precompiled/tsx"),
  typescript: () => import("@shikijs/langs-precompiled/typescript"),
  yaml: () => import("@shikijs/langs-precompiled/yaml"),
} satisfies Record<string, DynamicImportLanguageRegistration>;

const createHighlighter = createBundledHighlighter({
  langs: languages,
  themes: {
    "digest-alabaster": async () => ({ default: alabasterTheme }),
  } satisfies Record<string, DynamicImportThemeRegistration>,
  engine: () => createJavaScriptRegexEngine(),
});

const supportedLanguages = {
  text: { name: "Plain Text", aliases: ["text", "txt", "plaintext", "none"] },
  bash: { name: "Shell", aliases: ["bash", "sh", "shell", "zsh"] },
  c: { name: "C" },
  cpp: { name: "C++", aliases: ["cpp", "c++"] },
  css: { name: "CSS" },
  go: { name: "Go" },
  html: { name: "HTML" },
  java: { name: "Java" },
  javascript: { name: "JavaScript", aliases: ["js"] },
  json: { name: "JSON" },
  jsx: { name: "JSX" },
  markdown: { name: "Markdown", aliases: ["md"] },
  python: { name: "Python", aliases: ["py"] },
  ruby: { name: "Ruby", aliases: ["rb"] },
  rust: { name: "Rust", aliases: ["rs"] },
  sql: { name: "SQL" },
  swift: { name: "Swift" },
  tsx: { name: "TSX" },
  typescript: { name: "TypeScript", aliases: ["ts"] },
  yaml: { name: "YAML", aliases: ["yml"] },
};

export const codeBlock = createCodeBlockSpec({
  indentLineWithTab: true,
  defaultLanguage: "text",
  supportedLanguages,
  createHighlighter: () =>
    createHighlighter({ themes: ["digest-alabaster"], langs: [] }),
});
