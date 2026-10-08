/* The app's shared building blocks. Each one owns its look (colour, radius,
   weight); callers add only layout and size (padding, flex, text size), so
   the classes a caller passes never fight the ones set here. */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/* A bottom sheet over the app card. Tapping the scrim calls onClose (leave it
   out to make the scrim inert). The finale sits above everything else.
   `lift` raises the panel, e.g. above the on-screen keyboard. */
export function Sheet({
  onClose,
  finale,
  lift,
  label,
  className,
  children,
}: {
  onClose?: () => void;
  finale?: boolean;
  lift?: number;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "absolute inset-0 flex flex-col justify-end",
        finale ? "z-40" : "z-30",
      )}
      style={lift ? { paddingBottom: lift } : undefined}
    >
      <div
        onClick={onClose}
        className={cx(
          "absolute inset-0",
          finale ? "bg-[rgba(30,20,12,.40)]" : "bg-scrim",
        )}
      />
      <div
        role={label ? "dialog" : undefined}
        aria-label={label}
        className={cx(
          "relative flex flex-col rounded-t-sheet bg-paper",
          finale
            ? "animate-[sheetin_.34s_cubic-bezier(.2,.8,.2,1)] shadow-[0_-10px_40px_rgba(0,0,0,.2)]"
            : "animate-sheetin shadow-sheet",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

// The main action: filled accent. Callers set size and padding.
export function PrimaryButton({ className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "cursor-pointer rounded-tile bg-accent font-body font-bold text-accent-ink disabled:cursor-default disabled:opacity-45",
        className,
      )}
    />
  );
}

/* The alternative next to a primary button. "quiet" is an outline (Cancel,
   Edit as text); "solid" is a card-coloured button of equal weight (Back). */
export function SecondaryButton({
  tone = "quiet",
  className,
  ...props
}: ButtonProps & { tone?: "quiet" | "solid" }) {
  return (
    <button
      {...props}
      className={cx(
        "flex-none cursor-pointer rounded-tile border border-line font-body",
        tone === "quiet"
          ? "bg-transparent font-semibold text-ink-soft"
          : "bg-card font-bold text-ink",
        className,
      )}
    />
  );
}

// An underlined text link ("or type it instead"). Callers set colour and size.
export function TextButton({ className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "cursor-pointer bg-transparent font-body font-semibold underline underline-offset-3",
        className,
      )}
    />
  );
}

// A pill choice: accent-tinted when on. Callers set size and padding.
export function Chip({ on, className, ...props }: ButtonProps & { on: boolean }) {
  return (
    <button
      {...props}
      className={cx(
        "cursor-pointer rounded-full border font-body font-semibold text-ink",
        on ? "border-accent bg-accent-soft" : "border-line bg-card",
        className,
      )}
    />
  );
}

/* A loading ring. Callers set size and border width; "light" is for use on
   a tinted image placeholder. */
export function Spinner({
  light,
  className,
}: {
  light?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "animate-spin rounded-full border-t-accent",
        light ? "border-[rgba(255,255,255,.65)]" : "border-accent-soft",
        className,
      )}
    />
  );
}

// Keeps the screen's main action pinned above the scrolling content.
export function StickyBar({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "sticky bottom-0 bg-[linear-gradient(to_top,var(--paper),var(--paper)_66%,transparent)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* A two- or three-way choice in a pill track (Metric | Imperial, On | Off). */
export function Segmented<T extends string | boolean>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: [T, string][];
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-4 rounded-full border border-line bg-paper p-4"
    >
      {options.map(([key, text]) => {
        const on = value === key;
        return (
          <button
            key={text}
            role="radio"
            aria-checked={on}
            onClick={() => onPick(key)}
            className={cx(
              "flex-1 cursor-pointer rounded-full p-10 font-body text-14 font-bold",
              on ? "bg-accent text-accent-ink" : "bg-transparent text-ink-soft",
            )}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

/* A single-line text field. `on` is the surface it sits on, so it stays
   visible against it: paper inside a card, card on a sheet. */
export function TextInput({
  on = "card",
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { on?: "card" | "paper" }) {
  return (
    <input
      autoComplete="off"
      spellCheck={false}
      {...props}
      className={cx(
        "w-full rounded-inner border border-line px-13 py-12 font-body text-15 text-ink outline-none focus:border-accent",
        on === "card" ? "bg-paper" : "bg-card",
        className,
      )}
    />
  );
}
