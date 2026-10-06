import type { ReactNode } from "react";
import {
  Banknote,
  Check,
  Clock,
  Package,
  RotateCcw,
  Truck,
  X,
} from "lucide-react";
import type { DeliveryStatus, OrderStatus, PaymentStatus } from "@/types";
import {
  getDeliveryStatusLabel,
  getOrderStatusLabel,
  getPaymentStatusLabel,
} from "@/lib/services/orders";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

/* -------------------------------------------------------------------------- */
/*                                  Commande                                  */
/* -------------------------------------------------------------------------- */

const ORDER_VARIANTS: Record<OrderStatus, BadgeVariant> = {
  PENDING_CONFIRMATION: "warning",
  CONFIRMED: "info",
  PREPARING: "info",
  READY_FOR_DELIVERY: "info",
  ASSIGNED: "info",
  OUT_FOR_DELIVERY: "info",
  ARRIVED: "info",
  DELIVERED: "success",
  DELIVERY_FAILED: "danger",
  RETURNED: "neutral",
  CANCELLED: "neutral",
};

const ORDER_ICONS: Record<OrderStatus, ReactNode> = {
  PENDING_CONFIRMATION: <Clock className="size-3.5" />,
  CONFIRMED: <Check className="size-3.5" />,
  PREPARING: <Package className="size-3.5" />,
  READY_FOR_DELIVERY: <Package className="size-3.5" />,
  ASSIGNED: <Truck className="size-3.5" />,
  OUT_FOR_DELIVERY: <Truck className="size-3.5" />,
  ARRIVED: <Truck className="size-3.5" />,
  DELIVERED: <Check className="size-3.5" />,
  DELIVERY_FAILED: <X className="size-3.5" />,
  RETURNED: <RotateCcw className="size-3.5" />,
  CANCELLED: <X className="size-3.5" />,
};

/* -------------------------------------------------------------------------- */
/*                                  Livraison                                 */
/* -------------------------------------------------------------------------- */

const DELIVERY_VARIANTS: Record<DeliveryStatus, BadgeVariant> = {
  PENDING_ASSIGNMENT: "warning",
  ASSIGNED: "info",
  ACCEPTED: "info",
  IN_PREPARATION: "info",
  OUT_FOR_DELIVERY: "info",
  ARRIVED: "info",
  DELIVERED: "success",
  FAILED: "danger",
  RESCHEDULED: "info",
  RETURNED: "neutral",
};

const DELIVERY_ICONS: Record<DeliveryStatus, ReactNode> = {
  PENDING_ASSIGNMENT: <Clock className="size-3.5" />,
  ASSIGNED: <Truck className="size-3.5" />,
  ACCEPTED: <Check className="size-3.5" />,
  IN_PREPARATION: <Package className="size-3.5" />,
  OUT_FOR_DELIVERY: <Truck className="size-3.5" />,
  ARRIVED: <Truck className="size-3.5" />,
  DELIVERED: <Check className="size-3.5" />,
FAILED: <X className="size-3.5" />,
  RESCHEDULED: <Clock className="size-3.5" />,
  RETURNED: <RotateCcw className="size-3.5" />,
};

/* -------------------------------------------------------------------------- */
/*                                  Paiement                                  */
/* -------------------------------------------------------------------------- */

const PAYMENT_VARIANTS: Record<PaymentStatus, BadgeVariant> = {
  COD_PENDING: "warning",
  COD_COLLECTED: "success",
  COD_PARTIAL: "warning",
  COD_FAILED: "danger",
  REFUNDED: "info",
};

const PAYMENT_ICONS: Record<PaymentStatus, ReactNode> = {
  COD_PENDING: <Banknote className="size-3.5" />,
  COD_COLLECTED: <Check className="size-3.5" />,
  COD_PARTIAL: <Banknote className="size-3.5" />,
  COD_FAILED: <X className="size-3.5" />,
  REFUNDED: <RotateCcw className="size-3.5" />,
};

/* -------------------------------------------------------------------------- */
/*                                Présentation                                */
/* -------------------------------------------------------------------------- */

interface StatusBadgeViewProps {
  label: string;
  variant: BadgeVariant;
  icon: ReactNode;
  className: string | undefined;
}

function StatusBadgeView({
  label,
  variant,
  icon,
  className,
}: StatusBadgeViewProps) {
  return (
    <Badge variant={variant} icon={icon} className={className}>
      {label}
    </Badge>
  );
}

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  return (
    <StatusBadgeView
      label={getOrderStatusLabel(status)}
      variant={ORDER_VARIANTS[status]}
      icon={ORDER_ICONS[status]}
      className={className}
    />
  );
}

export interface DeliveryStatusBadgeProps {
  status: DeliveryStatus;
  className?: string;
}

export function DeliveryStatusBadge({
  status,
  className,
}: DeliveryStatusBadgeProps) {
  return (
    <StatusBadgeView
      label={getDeliveryStatusLabel(status)}
      variant={DELIVERY_VARIANTS[status]}
      icon={DELIVERY_ICONS[status]}
      className={className}
    />
  );
}

export interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  className?: string;
}

export function PaymentStatusBadge({
  status,
  className,
}: PaymentStatusBadgeProps) {
  return (
    <StatusBadgeView
      label={getPaymentStatusLabel(status)}
      variant={PAYMENT_VARIANTS[status]}
      icon={PAYMENT_ICONS[status]}
      className={className}
    />
  );
}