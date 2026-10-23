"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid animate-fade place-items-center bg-black/70 p-4" onMouseDown={onClose}>
      <div
        className={cn("relative w-full max-w-md animate-pop overflow-hidden rounded-xl bg-chat shadow-2xl", className)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 rounded p-1 text-sub hover:text-txt" aria-label="Close">
          <X className="size-5" />
        </button>
        {(title || subtitle) && (
          <div className="px-6 pt-6 pb-2 text-center">
            {title && <h2 className="text-xl font-bold">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-sub">{subtitle}</p>}
          </div>
        )}
        <div className="px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 bg-side px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "success" }) {
  const styles = {
    primary: "bg-accent hover:bg-accent-2 text-white",
    ghost: "text-txt hover:underline",
    danger: "bg-dnd hover:bg-dnd/85 text-white",
    success: "bg-ok hover:bg-ok/85 text-white",
  }[variant];
  return (
    <button
      {...props}
      className={cn("rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50", styles, className)}
    />
  );
}
