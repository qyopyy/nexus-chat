import type { Metadata } from "next";
import AboutPage from "@/components/site/AboutPage";

export const metadata: Metadata = { title: "About us", description: "Meet the team and artists behind Nexus — qyopy, MA Beats, ciaffa, void, kicsiden and twxn.", alternates: { canonical: "/about" } };

export default function Page() {
  return <AboutPage />;
}
