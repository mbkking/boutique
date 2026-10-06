"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setUserActiveAction,
  setUserRoleAction,
} from "@/lib/actions/admin/users";
import type { UserRole } from "@/types";

const ROLES: UserRole[] = ["admin", "order_operator", "stock_manager", "driver", "customer"];

export function UserRowActions({
  userId,
  role,
  isActive,
  canWrite,
}: {
  userId: string;
  role: UserRole;
  isActive: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canWrite) return null;

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Rôle"
        defaultValue={role}
        disabled={isPending}
        onChange={(event) => {
          setError(null);
          const nextRole = event.target.value as UserRole;
          startTransition(async () => {
            const result = await setUserRoleAction({ userId, role: nextRole });
            if (result.success) {
              router.refresh();
            } else {
              setError(result.error);
              event.target.value = role;
            }
          });
        }}
        className="h-9 rounded-lg border border-gray-200 bg-surface px-2 text-xs"
      >
        {ROLES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setUserActiveAction({ userId, isActive: !isActive });
            if (result.success) {
              router.refresh();
            } else {
              setError(result.error);
            }
          });
        }}
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        {isActive ? "Désactiver" : "Réactiver"}
      </button>

      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
