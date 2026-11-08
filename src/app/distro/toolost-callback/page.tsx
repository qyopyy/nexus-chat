import type { Metadata } from "next";
import TooLostCallback from "@/components/distro/TooLostCallback";

export const metadata: Metadata = { title: "Connecting Too Lost", robots: { index: false } };

/** OAuth redirect target for the Too Lost app — register this exact URL in the Too Lost Developer Portal. */
export default function Page() {
  return <TooLostCallback />;
}
