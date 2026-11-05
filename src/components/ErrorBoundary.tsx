"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; label?: string; onReset?: () => void };
type State = { err: Error | null };

/** Catches render crashes so one broken panel (e.g. Spaces) doesn't blank the whole app. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error) {
    console.error("[Nexus ErrorBoundary]", this.props.label ?? "ui", err);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="grid h-full min-h-[200px] place-items-center bg-chat p-6 text-center">
        <div className="max-w-sm">
          <div className="text-4xl">⚠️</div>
          <h2 className="mt-2 text-xl font-black">{this.props.label ?? "This view"} crashed</h2>
          <p className="mt-1 text-sm text-sub">{this.state.err.message || "Something went wrong rendering this screen."}</p>
          <button
            onClick={() => {
              this.setState({ err: null });
              this.props.onReset?.();
            }}
            className="mt-4 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
