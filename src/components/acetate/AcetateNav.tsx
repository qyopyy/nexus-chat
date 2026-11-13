"use client";

import { useState, type ReactNode } from "react";
import { Disc3, Library, Sparkles, Warehouse } from "lucide-react";
import { useDistributionPanelEnabled } from "@/lib/distributionPanel";

export type AcetateDestination = "library" | "projects" | "vault" | "bring" | "radio" | "recap" | "premium" | "panel";

const MAIN: { id: AcetateDestination; label: string; hint?: string }[] = [
  { id: "library", label: "Home" },
  { id: "projects", label: "Projects" },
  { id: "vault", label: "Vault" },
  { id: "bring", label: "Bring" },
  { id: "radio", label: "Radio" },
  { id: "recap", label: "Recap" },
  { id: "premium", label: "Premium" },
];

function useItems() {
  const panel = useDistributionPanelEnabled();
  if (!panel) return MAIN;
  return [...MAIN.slice(0, 4), { id: "panel" as const, label: "Distribution", hint: "Panel" }, ...MAIN.slice(4)];
}

function isActive(current: string, id: AcetateDestination) {
  return current === id || (id === "projects" && current === "project") || (id === "library" && current === "track");
}

export function AcetateSidebar(props: { current: string; onGo: (name: AcetateDestination) => void }) {
  const items = useItems();
  return (
    <aside className="hidden w-52 shrink-0 flex-col border-r border-[#3c342c] bg-[#16130f] md:flex">
      <div className="px-4 pt-5 pb-2">
        <p className="text-[11px] font-bold tracking-[0.18em] text-[#e4a15a] uppercase">Acetate</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-4" aria-label="Acetate">
        {items.map((item) => {
          const on = isActive(props.current, item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => props.onGo(item.id)}
              className="rounded-xl px-3 py-2.5 text-left text-sm font-semibold"
              style={{ background: on ? "#e4a15a" : "transparent", color: on ? "#100e0c" : "#f3eadf" }}
              aria-current={on ? "page" : undefined}
            >
              <span className="block">{item.label}</span>
              {item.hint && (
                <span className="block text-[11px] font-medium" style={{ color: on ? "#3c342c" : "#a3988c" }}>
                  {item.hint}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function AcetateTabBar(props: { current: string; onGo: (name: AcetateDestination) => void }) {
  const panel = useDistributionPanelEnabled();
  const items = useItems();
  const [menu, setMenu] = useState(false);
  return (
    <>
      <nav className="flex shrink-0 border-t border-[#3c342c] bg-[#16130f] pb-safe md:hidden" aria-label="Acetate">
        <Tab label="Home" active={isActive(props.current, "library")} onClick={() => props.onGo("library")} icon={<Library className="size-4" />} />
        <Tab label="Projects" active={isActive(props.current, "projects")} onClick={() => props.onGo("projects")} icon={<Disc3 className="size-4" />} />
        <Tab label="Vault" active={props.current === "vault"} onClick={() => props.onGo("vault")} icon={<Warehouse className="size-4" />} />
        {panel && <Tab label="Panel" active={props.current === "panel"} onClick={() => props.onGo("panel")} icon={<Disc3 className="size-4" />} />}
        <Tab label="Menu" active={menu} onClick={() => setMenu(true)} icon={<Sparkles className="size-4" />} />
      </nav>
      {menu && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-3 md:hidden" onClick={() => setMenu(false)}>
          <div className="mb-2 w-full max-w-md rounded-3xl bg-[#1a1612] p-3" onClick={(event) => event.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between px-2">
              <h2 className="font-serif text-2xl">Menu</h2>
              <button type="button" className="rounded-full bg-[#2a241c] px-3 py-1 text-sm" onClick={() => setMenu(false)}>
                Close
              </button>
            </div>
            {items
              .filter((item) => item.id !== "library" && item.id !== "projects" && item.id !== "vault" && item.id !== "panel")
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-semibold"
                  onClick={() => {
                    setMenu(false);
                    props.onGo(item.id);
                  }}
                >
                  <span>{item.label}</span>
                  {item.hint && <span className="text-xs text-[#a3988c]">{item.hint}</span>}
                </button>
              ))}
          </div>
        </div>
      )}
    </>
  );
}

function Tab(props: { label: string; active: boolean; onClick: () => void; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold"
      style={{ color: props.active ? "#e4a15a" : "#a3988c" }}
      aria-current={props.active ? "page" : undefined}
    >
      {props.icon}
      {props.label}
    </button>
  );
}
