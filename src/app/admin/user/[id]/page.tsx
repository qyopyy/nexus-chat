"use client";

import { useParams } from "next/navigation";
import OwnerDesk from "@/components/admin/OwnerDesk";

export default function AdminUserPage() {
  const params = useParams<{ id: string }>();
  return <OwnerDesk userId={params.id} />;
}
