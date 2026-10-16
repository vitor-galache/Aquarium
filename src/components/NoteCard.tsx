type Props = {
  title: string;
  excerpt: string;
  meta: string;
  highlighted?: boolean;
};

export function NoteCard({ title, excerpt, meta, highlighted = false }: Props) {
  return (
    <article
      className={`flex min-w-0 flex-1 flex-col gap-[7px] rounded-card border p-4 ${
        highlighted
          ? "border-brand-light bg-highlight"
          : "border-line bg-surface"
      }`}
    >
      <h3 className="text-md font-semibold">{title}</h3>
      <p className="text-sm text-muted">{excerpt}</p>
      <p className="text-2xs text-brand">{meta}</p>
    </article>
  );
}
