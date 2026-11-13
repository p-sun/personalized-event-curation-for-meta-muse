import { forwardRef, useCallback, useEffect, useLayoutEffect, useState, type AnimationEvent, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type AnimatedButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * The design-system button primitive. It owns the shared press animation, so
 * every styled button gets identical tap feedback without a separate wrapper
 * that a caller can forget to add. Use StyledButton for one-off visual styles;
 * reusable button variants below are all built on the same primitive.
 */
export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(function AnimatedButton(
  { className = "", type = "button", children, ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={`ui-animated-button ${className}`.trim()} {...props}>
      {children}
    </button>
  );
});

export const StyledButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(function StyledButton(props, ref) {
  return <AnimatedButton ref={ref} {...props} />;
});

type PresenceTransitionOptions = {
  exitAnimationName: string;
  exitDurationMs: number;
};

/**
 * Small enter/exit presence helper for CSS-animated views. It keeps a closing
 * view mounted until its exit keyframe finishes, with a timeout only as a
 * browser-interruption fallback. Callers own the visual CSS, so this stays
 * reusable without portals, layout measurement, or view-specific geometry.
 */
export function usePresenceTransition(
  visible: boolean,
  { exitAnimationName, exitDurationMs }: PresenceTransitionOptions,
) {
  const [mounted, setMounted] = useState(visible);
  const exiting = mounted && !visible;

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!exiting) return;
    const fallback = window.setTimeout(() => setMounted(false), exitDurationMs + 70);
    return () => window.clearTimeout(fallback);
  }, [exitDurationMs, exiting]);

  const onAnimationEnd = useCallback((event: AnimationEvent<HTMLElement>) => {
    if (exiting && event.animationName === exitAnimationName) setMounted(false);
  }, [exitAnimationName, exiting]);

  return { mounted, exiting, onAnimationEnd } as const;
}

type ButtonProps = AnimatedButtonProps & {
  tone?: "primary" | "secondary" | "quiet";
  icon?: ReactNode;
};

export function Button({ tone = "secondary", icon, className = "", children, ...props }: ButtonProps) {
  return (
    <AnimatedButton className={`ui-button ui-button-${tone} ${className}`.trim()} {...props}>
      {icon}
      {children}
    </AnimatedButton>
  );
}

export function IconButton({ className = "", children, ...props }: AnimatedButtonProps) {
  return (
    <AnimatedButton className={`ui-icon-button ${className}`.trim()} {...props}>
      {children}
    </AnimatedButton>
  );
}

type ToggleButtonProps = AnimatedButtonProps & { selected: boolean };

export function ToggleButton({ selected, className = "", children, ...props }: ToggleButtonProps) {
  return (
    <AnimatedButton
      className={`ui-toggle ${selected ? "is-selected" : ""} ${className}`.trim()}
      aria-pressed={selected}
      {...props}
    >
      {children}
    </AnimatedButton>
  );
}

type PopupMenuProps = {
  anchorRef: RefObject<HTMLElement | null>;
  menuId: string;
  menuClassName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: "start" | "end";
  offset?: number;
  children: ReactNode | ((props: { close: () => void }) => ReactNode);
};

type PopupPosition = Pick<CSSProperties, "top" | "left">;

type PopupViewport = {
  width: number;
  height: number;
  offsetLeft?: number;
  offsetTop?: number;
};

/**
 * Positions an anchored menu inside the visible viewport. The menu prefers to
 * open below its trigger, flips above when that is the side with room, and is
 * clamped on both axes as a final guard. This geometry belongs to the shared
 * popup rather than to individual menus, so every current and future popup
 * inherits the same screen-edge behavior.
 */
export function popupPosition(
  anchor: Pick<DOMRect, "top" | "bottom" | "left" | "right">,
  menu: Pick<DOMRect, "width" | "height">,
  viewport: PopupViewport,
  align: "start" | "end",
  offset: number,
  margin = 8,
): PopupPosition {
  const viewportLeft = viewport.offsetLeft ?? 0;
  const viewportTop = viewport.offsetTop ?? 0;
  const leftEdge = viewportLeft + margin;
  const rightEdge = viewportLeft + viewport.width - margin;
  const topEdge = viewportTop + margin;
  const bottomEdge = viewportTop + viewport.height - margin;

  const desiredLeft = align === "end" ? anchor.right - menu.width : anchor.left;
  const maxLeft = Math.max(leftEdge, rightEdge - menu.width);
  const left = Math.min(Math.max(desiredLeft, leftEdge), maxLeft);

  const belowTop = anchor.bottom + offset;
  const aboveTop = anchor.top - offset - menu.height;
  const roomBelow = bottomEdge - belowTop;
  const roomAbove = anchor.top - offset - topEdge;
  const fitsBelow = menu.height <= roomBelow;
  const fitsAbove = menu.height <= roomAbove;
  const desiredTop = fitsBelow || (!fitsAbove && roomBelow >= roomAbove) ? belowTop : aboveTop;
  const maxTop = Math.max(topEdge, bottomEdge - menu.height);
  const top = Math.min(Math.max(desiredTop, topEdge), maxTop);

  return { top, left };
}

export function dismissPopupForPointerTarget(
  anchor: Pick<HTMLElement, "contains"> | null,
  menu: Pick<HTMLElement, "contains"> | null,
  target: Node | null,
  dismiss: () => void,
) {
  if (!target || anchor?.contains(target) || menu?.contains(target)) return false;
  dismiss();
  return true;
}

/**
 * Shared anchored popup primitive. The originator button stays in its own
 * layout and styling context; this component only owns the menu contents,
 * anchoring, and dismissal. It intentionally has no backdrop, so an outside
 * pointer-down closes the menu while the same trusted tap continues to the
 * control underneath.
 */
export function PopupMenu({
  anchorRef,
  menuId,
  menuClassName = "",
  open,
  onOpenChange,
  align = "start",
  offset = 7,
  children,
}: PopupMenuProps) {
  const [menuElement, setMenuElement] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PopupPosition>({ top: 0, left: 0 });
  const close = () => onOpenChange(false);

  useLayoutEffect(() => {
    if (!open || !menuElement) return;
    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const visualViewport = window.visualViewport;
      setPosition(popupPosition(
        anchor.getBoundingClientRect(),
        menuElement.getBoundingClientRect(),
        {
          width: visualViewport?.width ?? window.innerWidth,
          height: visualViewport?.height ?? window.innerHeight,
          offsetLeft: visualViewport?.offsetLeft ?? 0,
          offsetTop: visualViewport?.offsetTop ?? 0,
        },
        align,
        offset,
      ));
    };
    updatePosition();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    resizeObserver?.observe(menuElement);
    if (anchorRef.current) resizeObserver?.observe(anchorRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [align, anchorRef, menuElement, offset, open]);

  useEffect(() => {
    if (!open) return;

    const dismissFromOutsidePointer = (event: PointerEvent) => {
      dismissPopupForPointerTarget(anchorRef.current, menuElement, event.target as Node | null, close);
    };
    const dismissFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", dismissFromOutsidePointer, true);
    document.addEventListener("keydown", dismissFromEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissFromOutsidePointer, true);
      document.removeEventListener("keydown", dismissFromEscape);
    };
  }, [anchorRef, menuElement, open, onOpenChange]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={setMenuElement}
      id={menuId}
      className={`popup-menu-layer ${menuClassName}`.trim()}
      style={position}
    >
      {typeof children === "function" ? children({ close }) : children}
    </div>,
    document.body,
  );
}

