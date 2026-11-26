"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/** Code-split a big screen: its JS downloads the first time it is opened, not with the app shell. Props stay fully typed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyHub<C extends ComponentType<any>>(loader: () => Promise<{ default: C }>): C {
  return dynamic(loader as never, {
    ssr: false,
    loading: () => <div className="grid h-full min-h-40 w-full place-items-center text-sm text-sub">Loading…</div>,
  }) as unknown as C;
}
