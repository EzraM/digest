import type { ThemeRegistration } from "@shikijs/types";

export const alabasterTheme: ThemeRegistration = {
  name: "digest-alabaster",
  type: "light",
  colors: {
    "editor.background": "#f7f7f7",
    "editor.foreground": "#000000",
  },
  settings: [
    {
      settings: {
        background: "#f7f7f7",
        foreground: "#000000",
      },
    },
    {
      name: "Comments",
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#aa3731" },
    },
    {
      name: "Strings",
      scope: ["string", "string.regexp", "constant.other.symbol"],
      settings: { foreground: "#448c27" },
    },
    {
      name: "Constants",
      scope: ["constant.numeric", "constant.character", "constant.keyword", "constant"],
      settings: { foreground: "#7a3e9d" },
    },
    {
      name: "Definitions",
      scope: "entity.name",
      settings: { foreground: "#325cc0" },
    },
    {
      name: "Punctuation",
      scope: "punctuation",
      settings: { foreground: "#777777" },
    },
    {
      name: "Invalid",
      scope: "invalid",
      settings: { background: "#96000014", foreground: "#660000" },
    },
  ],
};
