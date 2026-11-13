import type { Metadata } from "next";
import UntitledAppRoot from "@/components/untitled/UntitledAppRoot";

export const metadata: Metadata = {
  title: { absolute: "Untitled" },
  robots: { index: false, follow: false },
};

export default function UntitledAppPage() {
  return <UntitledAppRoot />;
}
