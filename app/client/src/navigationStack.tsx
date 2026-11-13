import {
useCallback,
useEffect,
useRef,
useState,
type ReactNode,
} from "react";

export type NavigationEntry<Route> = {
  id: string;
  route: Route;
};

export function pushNavigationEntry<Route>(
  entries: readonly NavigationEntry<Route>[],
  route: Route,
  id: string,
): NavigationEntry<Route>[] {
  return [...entries, { id, route }];
}

export function popNavigationEntry<Route>(
  entries: readonly NavigationEntry<Route>[],
): NavigationEntry<Route>[] {
  return entries.slice(0, -1);
}

export function useNavigationStack<Route>() {
  const [entries, setEntries] = useState<NavigationEntry<Route>[]>([]);
  const nextId = useRef(0);

  const push = useCallback((route: Route) => {
    nextId.current += 1;
    setEntries((current) => pushNavigationEntry(current, route, `screen-${nextId.current}`));
  }, []);

  const pop = useCallback(() => {
    setEntries((current) => popNavigationEntry(current));
  }, []);

  const popToRoot = useCallback(() => setEntries([]), []);

  return {
    entries,
    push,
    pop,
    popToRoot,
    top: entries.at(-1) ?? null,
    canGoBack: entries.length > 0,
  };
}

type NavigationScreenContext = {
  active: boolean;
  pop: () => void;
};

type NavigationStackProps<Route> = {
  entries: readonly NavigationEntry<Route>[];
  onPop: () => void;
  renderScreen: (entry: NavigationEntry<Route>, context: NavigationScreenContext) => ReactNode;
  children: ReactNode;
};

const POP_ANIMATION_MS = 220;

function InertLayer({ inactive, className, children }: { inactive: boolean; className: string; children: ReactNode }) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (elementRef.current) elementRef.current.inert = inactive;
  }, [inactive]);

  return (
    <div ref={elementRef} className={className} aria-hidden={inactive || undefined}>
      {children}
    </div>
  );
}

/**
 * A small push/pop navigator. Every pushed screen is a sibling painted after
 * the base and previous screens, so React/DOM order establishes the stack.
 * Covered screens stay mounted; their scroll position and local state are not
 * serialized or reconstructed when the top screen is popped.
 */
export function NavigationStack<Route>({ entries, onPop, renderScreen, children }: NavigationStackProps<Route>) {
  const [exitingId, setExitingId] = useState<string | null>(null);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const covered = entries.length > 0;

  useEffect(() => {
    if (!covered) return;
    const root = document.documentElement;
    const body = document.body;
    const rootOverflow = root.style.overflow;
    const bodyOverflow = body.style.overflow;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      root.style.overflow = rootOverflow;
      body.style.overflow = bodyOverflow;
    };
  }, [covered]);

  useEffect(() => () => {
    if (popTimer.current) clearTimeout(popTimer.current);
  }, []);

  useEffect(() => {
    if (exitingId && !entries.some((entry) => entry.id === exitingId)) setExitingId(null);
  }, [entries, exitingId]);

  const requestPop = useCallback(() => {
    const top = entries.at(-1);
    if (!top || exitingId) return;
    setExitingId(top.id);
    popTimer.current = setTimeout(() => {
      setExitingId(null);
      onPop();
    }, POP_ANIMATION_MS);
  }, [entries, exitingId, onPop]);

  return (
    <div className="navigation-stack">
      <InertLayer inactive={covered} className="navigation-stack-base">
        {children}
      </InertLayer>
      {entries.map((entry, index) => {
        const active = index === entries.length - 1;
        return (
          <InertLayer
            key={entry.id}
            inactive={!active}
            className={`navigation-stack-screen ${entry.id === exitingId ? "is-exiting" : ""}`}
          >
            {renderScreen(entry, { active, pop: requestPop })}
          </InertLayer>
        );
      })}
    </div>
  );
}
