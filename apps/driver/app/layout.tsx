import type { Metadata, Viewport } from "next";

import "@repo/app/globals.css";
import { Providers } from "@repo/components/layout/providers";
import { ServiceWorkerRegistrar } from "@repo/components/layout/service-worker-registrar";

/**
 * Layout racine de l'application livreur.
 *
 * Sans l'en-tête ni le pied de page de la boutique : l'espace livreur a sa
 * propre coque, pensée pour le terrain. Cette application ne sert que des
 * routes `/livreur/*` et `/driver/*`.
 */
export const metadata: Metadata = {
  title: {
    default: "Espace livreur",
    template: "%s | Espace livreur",
  },
  description:
    "Espace livreur ISF NAF-CHOPOP : livraisons, statuts et suivi en temps réel.",
  applicationName: "Espace livreur ISF NAF-CHOPOP",
  appleWebApp: {
    capable: true,
    title: "Espace livreur",
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

export default function DriverRootLayout({ children }: { children: React.ReactNode }) {
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
