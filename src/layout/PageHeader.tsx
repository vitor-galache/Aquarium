import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, action }: Props) {
  return (
    <div className="flex items-center gap-5">
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <p className="text-xs font-semibold text-brand">{eyebrow}</p>
        <h1 className="font-display text-heading font-semibold">{title}</h1>
        <p className="text-md text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
