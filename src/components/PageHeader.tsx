export function PageHeader({
  eyebrow,
  title,
  accent,
  desc,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  desc?: string;
}) {
  return (
    <div className="px-10 pt-10 pb-6">
      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
        {eyebrow}
      </p>
      <h1 className="font-serif text-3xl text-abys-navy mb-2">
        {title} {accent && <em className="italic text-abys-accent">{accent}</em>}
      </h1>
      {desc && <p className="text-abys-muted max-w-2xl">{desc}</p>}
    </div>
  );
}
