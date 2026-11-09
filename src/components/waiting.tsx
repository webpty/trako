// Whatever part of a page is waiting on something: dimmed, with HeroUI's dots in
// its middle, and not to be clicked through until it is done.
//
// A wait shorter than a blink shows nothing, so a quick answer does not flash,
// though the part refuses clicks from the first moment. And the dimming stays a
// moment after a wait ends, so one wait handing over to the next (saving, then
// reading the list again) reads as one.

import { ChatLoader } from "@heroui-pro/react/chat-loader";
import { useCallback, useEffect, useState } from "react";

const BLINK_MS = 200;
const LINGER_MS = 120;

/** A field's own corners, which the field look takes. */
const FIELD_SHAPE = "rounded-[var(--field-radius,calc(var(--radius)*1.5))]";

const DIM = {
  surface: "bg-[color-mix(in_oklab,var(--surface)_72%,transparent)]",
  page: "bg-[color-mix(in_oklab,var(--background)_72%,transparent)]",
} as const;

/** Lays itself over the nearest positioned parent while `on`. */
export function WaitingOverlay({
  className,
  ground = "surface",
  look = "dim",
  on,
}: {
  className?: string;
  /** What it sits on, so the dimming is that colour: a card, or the page. */
  ground?: keyof typeof DIM;
  /**
   * "dim" lays a veil over a part of the page. "field" covers a field with a
   * box of its own shape and colour, the dots in its middle, so a field that
   * is looking something up keeps its place and size.
   */
  look?: "dim" | "field";
  on: boolean;
}) {
  const [present, setPresent] = useState(on);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (on) {
      setPresent(true);
      const timer = setTimeout(() => setSeen(true), BLINK_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      setPresent(false);
      setSeen(false);
    }, LINGER_MS);
    return () => clearTimeout(timer);
  }, [on]);

  if (!on && !present) return null;
  return (
    <div
      aria-busy="true"
      className={`absolute inset-0 z-30 flex items-center justify-center transition-colors duration-150 ${
        look === "field" ? FIELD_SHAPE : "rounded-[inherit]"
      } ${seen ? (look === "field" ? "bg-default" : DIM[ground]) : "bg-transparent"} ${className ?? ""}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      role="status"
    >
      {/* On a little surface of their own, so they read over a busy map as
          clearly as over a plain page. */}
      {seen ? (
        look === "field" ? (
          <span className="waiting-dots flex items-center">
            <ChatLoader.Dots aria-label="Waiting" />
          </span>
        ) : (
          <span className="waiting-dots bg-default shadow-surface flex items-center rounded-full px-3 py-2">
            <ChatLoader.Dots aria-label="Waiting" />
          </span>
        )
      ) : null}
    </div>
  );
}

/** A whole page, or a whole panel, still on its way. */
export function PageWaiting({ className }: { className?: string }) {
  return (
    <div className={`relative h-full min-h-60 w-full ${className ?? ""}`}>
      <WaitingOverlay ground="page" on />
    </div>
  );
}

export type Work = <T>(job: () => Promise<T>) => Promise<T>;

/** Counts the jobs under way, so one part can wait on several at once. */
export function useWork(): [boolean, Work] {
  const [count, setCount] = useState(0);
  const work = useCallback(async <T,>(job: () => Promise<T>): Promise<T> => {
    setCount((n) => n + 1);
    try {
      return await job();
    } finally {
      setCount((n) => n - 1);
    }
  }, []) as Work;
  return [count > 0, work];
}
