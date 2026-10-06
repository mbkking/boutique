"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Phone, Mail, Clock, MessageCircle } from "lucide-react";

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormData({ name: "", email: "", phone: "", message: "" });
    setIsSubmitted(true);
    setTimeout(() => setIsSubmitted(false), 5000);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold text-text sm:text-4xl">Contact</h1>
        <p className="text-base text-text-muted">
          Une question sur un produit, une commande ou la livraison ? Notre équipe vous
          répond du lundi au samedi.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Coordonnées */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Nos coordonnées</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                  <Phone aria-hidden="true" className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text">Téléphone</p>
                  <p className="text-sm text-text-muted">+227 90 12 34 56</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                  <Mail aria-hidden="true" className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text">Email</p>
                  <p className="text-sm text-text-muted">contact@boutiqueniger.com</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                  <MapPin aria-hidden="true" className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text">Localisation</p>
                  <p className="text-sm text-text-muted">Niamey, Niger</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                  <Clock aria-hidden="true" className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text">Horaires</p>
                  <p className="text-sm text-text-muted">Lun &ndash; Sam : 8h &ndash; 18h</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Commande par téléphone</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-muted">
                Vous préférez commander par téléphone ? Appelez-nous directement et
                nous prenons note de votre commande.
              </p>
              <Button variant="primary" size="lg" className="mt-4 w-full">
                <Phone aria-hidden="true" className="size-4" />
                +227 90 12 34 56
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Formulaire */}
        <Card>
          <CardHeader>
            <CardTitle>Envoyez-nous un message</CardTitle>
          </CardHeader>
          <CardContent>
            {isSubmitted ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
                  <MessageCircle aria-hidden="true" className="size-6" />
                </div>
                <p className="text-base font-medium text-text">Message envoyé !</p>
                <p className="text-sm text-text-muted">
                  Nous vous répondrons dans les plus brefs délais.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="contact-name">Nom</Label>
                    <Input
                      label="Nom"
                      name="name"
                      type="text"
                      placeholder="Votre nom"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="contact-email">Email</Label>
                    <Input
                      label="Email"
                      name="email"
                      type="email"
                      placeholder="votre@email.com"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="contact-phone">Téléphone</Label>
                  <Input
                    label="Téléphone"
                    name="phone"
                    type="tel"
                    placeholder="+227 90 12 34 56"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="contact-message">Message</Label>
                  <Textarea
                    label="Message"
                    name="message"
                    placeholder="Votre message..."
                    value={formData.message}
                    onChange={handleChange}
                    rows={5}
                    required
                  />
                </div>

                <Button type="submit" variant="primary" size="lg" className="w-full">
                  Envoyer le message
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 flex flex-col gap-2 border-t border-border pt-6 text-center text-sm text-text-muted">
        <p>
          <Link href="/conditions-de-vente" className="underline hover:text-primary">
            Conditions de vente
          </Link>
          {" | "}
          <Link href="/politique-de-retour" className="underline hover:text-primary">
            Politique de retour
          </Link>
        </p>
        <p>Livraison à Niamey et quartiers — Paiement à la livraison</p>
      </div>
    </div>
  );
}
