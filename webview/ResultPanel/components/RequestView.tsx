import { JSX } from "react";
import { JsonView } from "./JsonView";

type Props = {
  params: Record<string, unknown>;
};

export function RequestView({ params }: Props): JSX.Element {
  return (
    <section style={{ marginBottom: "20px" }}>
      <h3
        style={{
          margin: "0 0 8px 0",
          fontSize: "var(--vscode-font-size)",
        }}
      >
        Request
      </h3>

      <div
        style={{
          border: "1px solid var(--vscode-panel-border)",
          padding: "8px 12px",
        }}
      >
        <JsonView value={params} />
      </div>
    </section>
  );
}
