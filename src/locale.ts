// The lists the settings page offers, worked out from what the browser knows
// rather than kept as a data file that would go stale.

/** The languages the app has words for. English for now; the rest arrive when
    there is something to translate. */
export const LANGUAGES = ["en"];

/** Every two-letter region the browser can name, as code and name. */
export function countries(language: string): { code: string; name: string }[] {
  const names = new Intl.DisplayNames([language], { type: "region" });
  const out: { code: string; name: string }[] = [];

  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      let name: string | undefined;
      try {
        name = names.of(code);
      } catch {
        continue;
      }
      // A region the browser does not know is handed back as its own code.
      if (name && name !== code) out.push({ code, name });
    }
  }

  return out.sort((x, y) => x.name.localeCompare(y.name, language));
}

export function countryName(code: string | null, language: string): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([language], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** What the browser is set to, cut down to the part that names a language. */
export function browserLanguage(): string {
  return (navigator.language || "en").slice(0, 2);
}
