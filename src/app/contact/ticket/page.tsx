import type { Metadata } from "next";
import TicketPage from "@/components/site/TicketPage";

export const metadata: Metadata = { title: "Your ticket", robots: { index: false, follow: false } };

export default function Page() {
  return <TicketPage />;
}
