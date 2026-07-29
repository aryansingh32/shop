import { cn } from "@/lib/utils";

export type StatusTone = "success" | "info" | "warning" | "danger" | "neutral";

const toneMap: Record<StatusTone, string> = {
  success:
    "bg-status-success-soft text-status-success ring-1 ring-inset ring-status-success/20",
  info: "bg-status-info-soft text-status-info ring-1 ring-inset ring-status-info/20",
  warning:
    "bg-status-warning-soft text-status-warning ring-1 ring-inset ring-status-warning/20",
  danger:
    "bg-status-danger-soft text-status-danger ring-1 ring-inset ring-status-danger/20",
  neutral:
    "bg-status-neutral-soft text-status-neutral ring-1 ring-inset ring-status-neutral/20",
};

const dotMap: Record<StatusTone, string> = {
  success: "bg-status-success",
  info: "bg-status-info",
  warning: "bg-status-warning",
  danger: "bg-status-danger",
  neutral: "bg-status-neutral",
};

export function StatusBadge({
  tone = "neutral",
  children,
  dot = true,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight",
        toneMap[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", dotMap[tone])} />}
      {children}
    </span>
  );
}

export function subscriptionStatusTone(status: string): StatusTone {
  switch (status) {
    case "active":
      return "success";
    case "trial":
      return "info";
    case "past_due":
      return "warning";
    case "suspended":
      return "danger";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

export function provisioningStatusTone(status: string): StatusTone {
  switch (status) {
    case "live":
      return "success";
    case "provisioning":
    case "pending":
      return "info";
    case "failed":
      return "danger";
    case "suspended":
      return "warning";
    case "deleted":
      return "neutral";
    default:
      return "neutral";
  }
}
