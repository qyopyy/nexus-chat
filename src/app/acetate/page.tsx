import type { Metadata } from "next";
import AcetateLanding from "@/components/acetate/AcetateLanding";
import { ACETATE } from "@/lib/acetateBrand";

export const metadata: Metadata = {
  title: { absolute: "Acetate — the cut before the record" },
  description: ACETATE.description,
  alternates: { canonical: "/acetate" },
};

export default function AcetateHomePage() {
  return <AcetateLanding />;
}
