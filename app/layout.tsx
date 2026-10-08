import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/providers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CartProvider } from "@/components/cart/cart-provider";
import { ServiceWorkerRegistrar } from "@/components/layout/service-worker-registrar";
import { AOSProvider } from "@/components/ui/aos-provider";
import { getSiteName, getBranding } from "@/lib/data/site";
import { listActiveDeliveryZones } from "@/lib/data/delivery-zones";
import { VisitTracker } from "@/components/layout/visit-tracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Le nom vient des paramètres (admin) : les pages statiques se régénèrent
// toutes les 5 minutes pour refléter une modification côté admin.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const siteName = await getSiteName();
  return {
    title: {
      default: `${siteName} — Achat en ligne à Niamey`,
      template: `%s | ${siteName}`,
    },
    description:
      "Commandez en ligne à Niamey : meubles, vêtements, chaussures, parfums et accessoires. Paiement à la livraison, livraison dans les principaux quartiers.",
    applicationName: siteName,
    formatDetection: { telephone: true },
    appleWebApp: {
      capable: true,
      title: siteName,
      statusBarStyle: "default",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#1e2a2d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const siteName = await getSiteName();
  const branding = await getBranding();
  const deliveryZones = await listActiveDeliveryZones();
  const footerQuarters = [
    ...new Set(deliveryZones.flatMap((zone) => zone.quarters)),
  ];

  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <style>{`:root{--color-primary:${branding.brand_primary};--color-secondary:${branding.brand_secondary};--color-primary-light:${branding.brand_accent}}`}</style>
        <Providers>
          <ServiceWorkerRegistrar />
          <VisitTracker />
          <CartProvider>
            <AOSProvider>
              <a
                href="#contenu"
                className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:px-4 focus:py-2 focus:text-white"
              >
                Aller au contenu principal
              </a>
              <Header siteName={siteName} logoUrl={branding.brand_logo_url || undefined} />
              <main id="contenu" className="flex-1">
                {children}
              </main>
              <Footer siteName={siteName} quarters={footerQuarters} />
            </AOSProvider>
          </CartProvider>
        </Providers>
      </body>
    </html>
  );
}
