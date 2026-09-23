import { ReactNode, useState } from "react";

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="section">
      <button
        className="section-header"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`section-chevron ${open ? "open" : ""}`}>›</span>

        <span className="section-title">{title}</span>
      </button>

      {open && <div className="section-content">{children}</div>}
    </section>
  );
}

export default Section;
