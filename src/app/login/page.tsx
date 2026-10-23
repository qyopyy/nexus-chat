import type { Metadata } from "next";
import Root from "@/components/Root";

export const metadata: Metadata = { title: "Log in · Nexus" };

export default function LoginPage() {
  return <Root mode="login" />;
}
