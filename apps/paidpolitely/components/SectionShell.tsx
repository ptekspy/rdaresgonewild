import type { ReactNode } from "react";

export function SectionShell({
  id,
  eyebrow,
  title,
  children,
  intro,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section className="section-shell" id={id}>
      <div className="section-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {intro ? <p className="section-intro">{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}
