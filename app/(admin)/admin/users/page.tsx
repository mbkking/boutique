import { ShieldCheck } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can, permissionsFor } from "@/lib/auth/permissions";
import { listAdminUsers } from "@/lib/data/admin/catalog";
import { CreateUserForm } from "@/app/(admin)/admin/users/create-user-form";
import { formatPhoneForDisplay } from "@/lib/platform/native";
import { UserRowActions } from "./user-row-actions";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { UserRole } from "@/types";

export const metadata = {
  title: "Utilisateurs et rôles",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrateur",
  order_operator: "Opérateur de commandes",
  stock_manager: "Gestionnaire de stock",
  driver: "Livreur",
  customer: "Client",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

/**
 * Utilisateurs et droits effectifs.
 *
 * Le rôle affiché est celui enregistré en base. Il ne provient jamais du
 * navigateur : chaque action revalide le rôle côté serveur via `requirePermission`.
 * Cette page montre les droits réels de chaque rôle, ce qui évite de se fier à
 * une intuition.
 */
export default async function AdminUsersPage() {
  const profile = await guardPage([PERMISSIONS.USER_READ]);
  const canWriteUsers = can(profile.role, PERMISSIONS.USER_WRITE);

  const users = await listAdminUsers();

  const grouped = new Map<UserRole, typeof users>();
  for (const user of users) {
    const list = grouped.get(user.role) ?? [];
    list.push(user);
    grouped.set(user.role, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Utilisateurs et rôles</h1>
        <p className="text-sm text-gray-500">
          {`${users.length} compte(s). Un compte est créé via l'inscription ; le rôle est attribué par un administrateur.`}
        </p>
      </header>
      {canWriteUsers ? <CreateUserForm /> : null}


      {/* Droits par rôle : la matrice réellement appliquée */}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              <ShieldCheck aria-hidden="true" className="size-4" />
              Droits appliqués par rôle
            </h2>

            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(["admin", "order_operator", "stock_manager", "driver", "customer"] as UserRole[]).map(
                (role) => {
                  const rights = permissionsFor(role);

                  return (
                    <li key={role} className="rounded-lg border border-gray-200 p-3">
                      <p className="text-sm font-semibold text-gray-900">{ROLE_LABELS[role]}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {rights.length === 0
                          ? "Aucun droit d'administration."
                          : `${rights.length} droit(s) : ${rights.join(", ")}`}
                      </p>
                    </li>
                  );
                }
              )}
            </ul>
          </div>
        </CardContent>
      </Card>

      {users.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck aria-hidden="true" className="size-6" />}
          title="Aucun utilisateur"
          description="Aucun compte n'a été créé."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {[...grouped.entries()].map(([role, members]) => (
            <section key={role} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                {`${ROLE_LABELS[role]} (${members.length})`}
              </h2>

              <ul className="flex flex-col gap-2">
                {members.map((user) => (
                  <li key={user.id}>
                    <Card>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm font-medium text-gray-900">
                            {user.fullName}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatPhoneForDisplay(user.phone)} · inscrit le {formatDate(user.createdAt)}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              user.isActive
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {user.isActive ? "actif" : "désactiv�"}
                          </span>
                          <UserRowActions
                            userId={user.id}
                            role={user.role}
                            isActive={user.isActive}
                            canWrite={canWriteUsers}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
