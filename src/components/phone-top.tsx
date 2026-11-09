// The band across the top of a phone, beside the button that opens the menu.
//
// There is no bar across the top of the site, so on a phone that band held one
// round button and nothing else. Each page puts its own row of controls up
// there instead, and keeps for its contents the pixels that row used to take.
//
// A page writes the row once and hands it here. On a screen wide enough for
// the sidebar the row is given back, to be written where the page wants it.

import { useEffect, useState, type ReactNode } from "react";

/** Wide enough for the sidebar to be on screen, so there is no band. */
const WIDE = "(min-width: 1024px)";

/** Whether the sidebar is beside the page rather than hidden behind a button. */
export function useBeside(): boolean {
  const [beside, setBeside] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const watch = window.matchMedia(WIDE);
    const tell = () => setBeside(watch.matches);
    watch.addEventListener("change", tell);
    return () => watch.removeEventListener("change", tell);
  }, []);
  return beside;
}

/**
 * The band itself: from the menu button to the right edge, one row high, over
 * whatever the page has put under it. Twelve pixels sit between everything in
 * it and between it and the edges of the screen, so nothing reads as crowded
 * against the side.
 */
export function PhoneTop({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-auto fixed top-3 right-3 left-16 z-40 flex h-10 items-center gap-3 lg:hidden ${className}`}
    >
      {children}
    </div>
  );
}
