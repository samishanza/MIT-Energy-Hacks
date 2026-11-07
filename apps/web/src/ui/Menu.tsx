import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuProps {
  label: string;
  /** Shown as a badge after the label. */
  count?: number;
  /** Draws the button as needing a look, as when something needs attention. */
  alert?: boolean;
  /** Which edge of the button the panel lines up with. */
  align?: "left" | "right";
  /** Receives a function that closes the menu, for items that move the person on. */
  children: (close: () => void) => ReactNode;
}

/** A button that drops a panel over the page. Closes on a click outside or Escape. */
export function Menu({ label, count, alert = false, align = "left", children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div className={`menu${alert ? " menu-alert" : ""}`} ref={root}>
      <button type="button" className="menu-button" aria-expanded={open} onClick={() => setOpen((shown) => !shown)}>
        {label}
        {count !== undefined ? <span className="menu-count">{count}</span> : null}
        <span className="menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div className={`menu-panel menu-${align}`} role="region" aria-label={`${label} menu`}>
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}
