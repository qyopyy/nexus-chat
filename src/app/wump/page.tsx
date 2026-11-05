import { redirect } from "next/navigation";

/** Legacy + new brand: Wump is the location app formerly called Bump. */
export default function WumpIndex() {
  redirect("/wump/app");
}
