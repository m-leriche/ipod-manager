import { useRef, useState, useEffect } from "react";

let sharedObserver: IntersectionObserver | null = null;
const targets = new Map<Element, () => void>();

/** Reset module state — only for tests. */
export const _resetForTests = (): void => {
  sharedObserver?.disconnect();
  sharedObserver = null;
  targets.clear();
};

const getObserver = (): IntersectionObserver => {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cb = targets.get(entry.target);
            if (cb) {
              cb();
              targets.delete(entry.target);
              sharedObserver?.unobserve(entry.target);
            }
          }
        }
      },
      { rootMargin: "200px" },
    );
  }
  return sharedObserver;
};

const observe = (element: Element, callback: () => void): (() => void) => {
  const observer = getObserver();
  targets.set(element, callback);
  observer.observe(element);
  return () => {
    targets.delete(element);
    observer.unobserve(element);
  };
};

/**
 * Defers rendering until the element scrolls into (or near) the viewport.
 * Uses a single shared IntersectionObserver with 200px rootMargin for prefetch.
 * Once visible, stays visible permanently (no unloading on scroll away).
 */
export const useLazyImage = (enabled: boolean = true): { ref: React.RefCallback<Element>; isVisible: boolean } => {
  const [isVisible, setIsVisible] = useState(!enabled);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Stable ref callback — observes on mount, unobserves on unmount
  const refCallback = useRef<React.RefCallback<Element>>((node: Element | null) => {
    // Cleanup previous observation
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!node || !enabled) return;

    cleanupRef.current = observe(node, () => setIsVisible(true));
  }).current;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return { ref: refCallback, isVisible };
};
