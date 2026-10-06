import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { getSessionProfile } from "@/lib/supabase/session";
import { getCustomerByProfileId, listAddressesForCustomer } from "@/lib/data/account";
import { listActiveDeliveryZones } from "@/lib/data/delivery-zones";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AccountSubnav } from "@/app/(account)/account/subnav";
import {
  AddressForm,
  DeleteAddressButton,
} from "@/app/(account)/account/addresses/address-forms";

export const metadata: Metadata = {
  title: "Mes adresses",
  description: "Gérez vos adresses de livraison.",
  robots: { index: false, follow: false },
};

export const revalidate = 0;

export default async function AccountAddressesPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/account");

  const customer = await getCustomerByProfileId(profile.id);
  if (!customer) redirect("/account");

  // Les quartiers proposés sont ceux réellement desservis : c'est ce qui
  // permet de calculer les frais de livraison.
  const zones = await listActiveDeliveryZones();
  const quarters = [...new Set(zones.flatMap((zone) => zone.quarters))].sort((a, b) =>
    a.localeCompare(b, "fr")
  );

  const [addresses] = await Promise.all([listAddressesForCustomer(customer.id)]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">Mes adresses</h1>
        <p className="text-sm text-text-muted">
          Gagnez du temps à la prochaine commande en enregistrant vos points de
          livraison.
        </p>
      </header>

      <AccountSubnav current="/account/addresses" />

      {addresses.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => (
            <li key={address.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-text">
                      {`${address.quarter}${address.sector ? `, ${address.sector}` : ""}`}
                    </h2>
                    {address.is_default ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Par défaut
                      </span>
                    ) : null}
                  </div>

                  <address className="flex flex-1 flex-col gap-1 text-sm not-italic text-text-muted">
                    <span className="flex items-start gap-2">
                      <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {address.quarter} — {address.city}
                      </span>
                    </span>
                    <span>{address.landmark}</span>
                    {address.instructions ? <span>{address.instructions}</span> : null}
                    <span className="text-xs">{`Code : ${address.address_code}`}</span>
                  </address>

                  <DeleteAddressButton addressId={address.id} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<MapPin aria-hidden="true" className="size-6" />}
          title="Aucune adresse enregistrée"
          description="Ajoutez une adresse pour accélérer vos prochaines commandes."
        />
      )}

      <AddressForm quarters={quarters} />
    </div>
  );
}