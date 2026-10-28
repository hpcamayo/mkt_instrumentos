"use client";

import { Component, lazy, Suspense, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { reportClientError } from "@/lib/monitoring/client-errors";

// Shows `failed` in place of its children when they throw: mostly their code didn't download, but an error the part
// raised once loaded lands here too. Either is counted in Admin > Errores, as the pages' own error boundaries count
// theirs (launch audit A13).
class LoadFailure extends Component<{ failed: () => ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportClientError("boundary", error);
  }

  render() {
    return this.state.failed ? this.props.failed() : this.props.children;
  }
}

const subscribeNever = () => () => {};

// Where the focus was when the part was asked for (the photo that opened the lightbox, say). `free` is true while the
// visitor hasn't moved it elsewhere since, so a failed part takes the focus only then; `restore` puts it back there.
export type AfterPageFocus = { free: () => boolean; restore: () => void };

// A part of a page whose code downloads after the page, in the browser only, as next/dynamic with ssr: false did. With
// that, a failed download reached app/error.tsx, which replaced the whole page, and React keeps a failed lazy part's
// error, so retrying the page never downloaded it again. Here `loading` shows until the code is there (the server sends
// it too); if the download fails, only this part shows `failed`, and its `retry`, or the part's next showing (the
// lightbox opened again), downloads the code again.
export function afterPage<P extends object>(
  load: () => Promise<ComponentType<P>>,
  parts: { loading: () => ReactNode; failed: (retry: () => void, props: P, focus: AfterPageFocus) => ReactNode },
) {
  // One lazy part for every place it shows, so a download that worked serves them all at once; a failed one is
  // replaced with a new one for the next try.
  const lazyPart = (): ComponentType<P> =>
    lazy(() =>
      load().then(
        (loaded) => ({ default: loaded }),
        (error: unknown) => {
          Loaded = lazyPart();
          throw error;
        },
      ),
    ) as unknown as ComponentType<P>;
  let Loaded = lazyPart();
  function AfterPage(props: P) {
    const [attempt, setAttempt] = useState(0);
    const [focusAtStart] = useState(() => (typeof document === "undefined" ? null : document.activeElement));
    const browser = useSyncExternalStore(subscribeNever, () => true, () => false);
    if (!browser) return parts.loading();
    const retry = () => setAttempt((count) => count + 1);
    const focus: AfterPageFocus = {
      free: () => {
        const active = document.activeElement;
        return !active || active === document.body || active === focusAtStart;
      },
      restore: () => {
        if (focusAtStart instanceof HTMLElement && focusAtStart.isConnected) focusAtStart.focus({ preventScroll: true });
      },
    };
    const Part = Loaded;
    return (
      <LoadFailure key={attempt} failed={() => parts.failed(retry, props, focus)}>
        <Suspense fallback={parts.loading()}>
          <Part {...props} />
        </Suspense>
      </LoadFailure>
    );
  }
  return AfterPage;
}
