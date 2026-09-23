import { JSX } from "react";
import { ServiceInvocationViewModel } from "../../shared/service-invocation-result";

type Props = {
  thingName: string;
  serviceName: string;
  status: ServiceInvocationViewModel["status"];
};

export function ResultHeader({
  thingName,
  serviceName,
  status,
}: Props): JSX.Element {
  return (
    <section
      style={{
        marginBottom: "16px",
        paddingBottom: "12px",
        borderBottom: "1px solid var(--vscode-panel-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        <strong
          style={{
            color: status.ok
              ? "var(--vscode-testing-iconPassed)"
              : "var(--vscode-testing-iconFailed)",
          }}
        >
          {status.ok ? "✓" : "✕"} {status.code} {status.text}
        </strong>
      </div>

      <div>
        <strong>{thingName}</strong>
        <span style={{ color: "var(--vscode-descriptionForeground)" }}>
          {" "}
          ·{" "}
        </span>
        <strong>{serviceName}</strong>
      </div>
    </section>
  );
}
