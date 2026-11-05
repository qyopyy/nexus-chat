"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AppFrame({
  title,
  Icon,
  iconClass,
  mobile,
  onBack,
  actions,
  children,
  wide,
}: {
  title: string;
  Icon: LucideIcon;
  iconClass?: string;
  mobile?: boolean;
  onBack: () => void;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button onClick={onBack} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to apps">
          <ArrowLeft className="size-5" />
        </button>
        <Icon className={cn("size-5", iconClass || "text-[#00a8fc]")} />
        <span className="min-w-0 flex-1 truncate font-bold">{title}</span>
        {actions}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <div className={cn("mx-auto space-y-4", wide ? "max-w-5xl" : "max-w-2xl")}>{children}</div>
      </div>
    </div>
  );
}
