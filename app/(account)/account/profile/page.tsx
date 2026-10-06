import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/session";
import { getCustomerByProfileId, getCustomerStats } from "@/lib/data/account";
import { formatPrice } from "@/lib/services/pricing";
import { Card, CardContent } from "@/components/ui/card";
import { SignOutButton } from "@/app/_components/sign-out-button";
import { AccountSubnav } from "@/app/(account)/account/subnav";
import { ProfileForm } from "@/app/(account)/account/profile/profile-form";

export const metadata: Metadata = {
  title: "Mon profil",
  description: "Gérez vos informations personnelles.",
  robots: { index: false, follow: false },
};

export const revalidate = 0;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

export default async function AccountProfilePage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/account");

  const customer = await getCustomerByProfileId(profile.id);
  if (!customer) redirect("/account");

  const stats = await getCustomerStats(customer.id);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text sm:text-3xl">Mon profil</h1>
          <p className="text-sm text-text-muted">
            {`Client depuis le ${formatDate(customer.created_at)}`}
          </p>
        </div>
        <SignOutButton />
      </header>

      <AccountSubnav current="/account/profile" />

      <ProfileForm
        defaultFullName={customer.full_name}
        defaultPhone={customer.phone}
      />

      <Card>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-text-muted">Commandes passées</dt>
              <dd className="text-lg font-bold text-text">{stats.orderCount}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Total dépensé</dt>
              <dd className="text-lg font-bold text-text">{formatPrice(stats.totalSpent)}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Rôle</dt>
              <dd className="text-lg font-bold text-text">{profile.role}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}