declare module "@shikijs/langs-precompiled/*" {
  import type { LanguageRegistration } from "@shikijs/types";

  const language: LanguageRegistration[];
  export default language;
}
