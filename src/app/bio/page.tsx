import { redirect } from "next/navigation";

/** Nexus Link landing → editor (login if needed). */
export default function BioLanding() {
  redirect("/bio/app");
}
