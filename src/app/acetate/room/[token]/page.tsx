"use client";

import { useParams } from "next/navigation";
import AcetateRoom from "@/components/acetate/AcetateRoom";

export default function AcetateRoomPage() {
  const params = useParams<{ token: string }>();
  return <AcetateRoom token={params.token || ""} />;
}
