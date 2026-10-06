import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      // Repère utilisé par la couche de thème du back-office : la couleur de
      // fond des cartes devient pilotable depuis les paramètres admin.
      data-admin-surface="true"
      className={cn(
        "rounded-xl border border-border bg-surface shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export type CardHeaderProps = HTMLAttributes<HTMLDivElement>;

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-border px-4 py-3 sm:px-5 sm:py-4",
        className
      )}
      {...props}
    />
  );
}

export type CardTitleProps = HTMLAttributes<HTMLHeadingElement>;

export function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h3
      className={cn("text-base font-semibold text-text", className)}
      {...props}
    />
  );
}

export type CardDescriptionProps = HTMLAttributes<HTMLParagraphElement>;

export function CardDescription({
  className,
  ...props
}: CardDescriptionProps) {
  return (
    <p className={cn("text-sm text-text-muted", className)} {...props} />
  );
}

export type CardContentProps = HTMLAttributes<HTMLDivElement>;

export function CardContent({ className, ...props }: CardContentProps) {
  return (
    <div className={cn("px-4 py-4 sm:px-5", className)} {...props} />
  );
}

export type CardFooterProps = HTMLAttributes<HTMLDivElement>;

export function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 sm:px-5 sm:py-4",
        className
      )}
      {...props}
    />
  );
}