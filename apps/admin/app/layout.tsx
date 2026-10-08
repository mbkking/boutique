import type { Metadata, Viewport } from "next";

import "@repo/app/globals.css";
import { Providers } from "@repo/components/layout/providers";
import { ServiceWorkerRegistrar } from "@repo/components/layout/service-worker-registrar";

/**
 * Layout racine de l'application d'administration.
 *
 * Volontairement **sans** l'en-tête et le pied de page de la boutique : le
 * back-office a sa propre coque (barre latérale, en-tête, thème). Cette
 * application ne sert que des routes `/admin/*`.
 */
export const metadata: Metadata = {
  title: {
    default: "Administration",
    template: "%s | Administration",
  },
  description:
    "Back-office de la boutique ISF NAF-CHOPOP : commandes, produits, clients et promotions.",
  applicationName: "Administration ISF NAF-CHOPOP",
  appleWebApp: {
    capable: true,
    title: "Administration",
    statusBarStyle: "default",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1e2a2d",
};

export const dynamic = "force-dynamic";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>
          <ServiceWorkerRegistrar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
