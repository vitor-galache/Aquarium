import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary";

const variants: Record<Variant, string> = {
  primary: "border-brand bg-brand text-white hover:bg-abyss hover:border-abyss",
  secondary: "border-line bg-surface text-brand hover:bg-highlight",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  icon,
  className = "",
  children,
  ...props
}: Props) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-card border px-4 py-2.5 text-md font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-light ${variants[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
