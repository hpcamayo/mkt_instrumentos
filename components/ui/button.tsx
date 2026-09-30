import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "onDark";
export type ButtonSize = "sm" | "md" | "lg";

// One primary (yellow) action per view. Secondary for the rest, quiet for low-emphasis text actions,
// danger for destructive ones, onDark for secondary actions on the black frame.
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-action text-action-ink hover:bg-action-hover disabled:bg-subtle disabled:text-ink-3 aria-busy:disabled:bg-action aria-busy:disabled:text-action-ink",
  secondary:
    "border border-line-strong bg-surface text-ink hover:bg-canvas disabled:border-subtle disabled:text-ink-3 aria-busy:disabled:border-line-strong aria-busy:disabled:text-ink",
  quiet:
    "px-1 text-ink underline decoration-accent decoration-2 underline-offset-[3px] hover:decoration-ink disabled:text-ink-3 disabled:decoration-subtle",
  danger: "border border-danger bg-surface text-danger hover:bg-danger-tint disabled:border-subtle disabled:text-ink-3",
  onDark: "border border-white/40 bg-transparent text-surface hover:border-white hover:bg-white/10 disabled:text-muted-dark",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 px-3 text-[14px] leading-5 [&_svg]:h-4 [&_svg]:w-4",
  md: "h-11 gap-2 px-4 text-[16px] leading-6 [&_svg]:h-[18px] [&_svg]:w-[18px]",
  lg: "h-[52px] gap-2 px-5 text-[18px] leading-6 [&_svg]:h-5 [&_svg]:w-5",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-control font-semibold transition-colors duration-120 disabled:cursor-not-allowed [&_svg]:shrink-0",
    SIZES[size],
    VARIANTS[variant],
    variant === "quiet" && "h-auto min-h-6",
    block && "w-full",
    className,
  );
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  children?: ReactNode;
  className?: string;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> & {
    href?: undefined;
    loading?: boolean;
    loadingLabel?: string;
  };

type ButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className" | "href"> & {
    href: string;
    prefetch?: boolean;
  };

export function Button(props: ButtonAsButton | ButtonAsLink) {
  if (typeof props.href === "string") {
    const { variant, size, block, icon, iconEnd, children, className, href, prefetch, ...rest } = props;
    const classes = buttonClasses({ variant, size, block, className });
    const content = (
      <>
        {icon}
        {children}
        {iconEnd}
      </>
    );
    if (/^(https?:|mailto:|tel:)/.test(href)) {
      return (
        <a href={href} className={classes} {...rest}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} prefetch={prefetch} className={classes} {...rest}>
        {content}
      </Link>
    );
  }
  const { variant, size, block, icon, iconEnd, children, className, loading, loadingLabel, disabled, type, ...rest } =
    props as ButtonAsButton;
  return (
    <button
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {loading && loadingLabel ? loadingLabel : children}
      {loading ? null : iconEnd}
    </button>
  );
}

// Icon-only control: the label is required and becomes the accessible name.
export function IconButton({
  label,
  icon,
  size = "md",
  variant = "secondary",
  className,
  type,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  icon: ReactNode;
  size?: "sm" | "md";
  variant?: "secondary" | "onDark" | "quiet";
}) {
  return (
    <button
      type={type ?? "button"}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-control transition-colors duration-120 disabled:cursor-not-allowed disabled:text-ink-3 [&_svg]:shrink-0",
        size === "sm" ? "h-9 w-9 [&_svg]:h-4 [&_svg]:w-4" : "h-11 w-11 [&_svg]:h-5 [&_svg]:w-5",
        variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-canvas",
        variant === "onDark" && "border border-white/40 text-surface hover:border-white hover:bg-white/10",
        variant === "quiet" && "text-ink hover:bg-canvas",
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
