import { redirect } from "next/navigation";

/** Route canonique : `/driver`. `/livreur` est conservé en alias. */
export default function LivreurPage() {
  redirect("/driver");
}
