import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LivreurLivraisonIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/driver/deliveries/${id}`);
}
