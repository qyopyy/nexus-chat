import type { Metadata } from "next";
import ContactPage from "@/components/site/ContactPage";

export const metadata: Metadata = { title: "Contact us", description: "Questions or problems? Send the Nexus team a message and get a reply by email.", alternates: { canonical: "/contact" } };

export default function Page() {
  return <ContactPage />;
}
