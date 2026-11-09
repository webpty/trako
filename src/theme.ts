// Light or dark, remembered per browser. The same rules run as a small script
// in index.html before anything paints, so nobody sees a flash of the wrong one;
// the two are kept in step by hand.

export type Theme = "light" | "dark" | "system";

const KEY = "trako:theme";

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // A browser with site data turned off still gets a working page.
  }
  return "system";
}

export function applyTheme(theme: Theme): void {
  const dark =
    theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Nothing remembered; the page still shows what was asked for.
  }
}

/** True when the page is currently dark, whatever chose it. */
export function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}
