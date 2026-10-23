import type { Metadata } from "next";
import Root from "@/components/Root";

export const metadata: Metadata = { title: "Create account · Nexus" };

export default function RegisterPage() {
  return <Root mode="register" />;
}
