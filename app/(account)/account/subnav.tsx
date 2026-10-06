import Link from "next/link";
import { cn } from "@/lib/utils";

const links = [
  { href: "/account", label: "Vue d'ensemble" },
  { href: "/account/orders", label: "Commandes" },
  { href: "/account/addresses", label: "Adresses" },
  { href: "/account/profile", label: "Profil" },
];

/**
 * Navigation de l'espace client.
 *
 * Les liens pointent vers des routes réelles ; chaque page appliquerait sa
 * propre garde de session.
 */
export function AccountSubnav({ current }: { current?: string }) {
  return (
    <nav aria-label="Sections de mon compte" className="border-b border-border">
      <ul className="flex flex-wrap gap-x-1 gap-y-2">
        {links.map((link) => {
          const isActive = current === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-text-muted hover:border-border hover:text-text"
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}