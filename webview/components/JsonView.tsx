import { JSX } from "react";

type Props = {
  value: unknown;
};

export function JsonView({ value }: Props): JSX.Element {
  return (
    <div
      style={{
        fontFamily: "var(--vscode-editor-font-family)",
        fontSize: "var(--vscode-editor-font-size)",
      }}
    >
      <JsonNode value={value} />
    </div>
  );
}

type JsonNodeProps = {
  value: unknown;
  name?: string;
};

function JsonNode({ value, name }: JsonNodeProps): JSX.Element {
  if (value === null) {
    return <Primitive name={name} value="null" />;
  }

  if (typeof value === "string") {
    return <Primitive name={name} value={`"${value}"`} />;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return <Primitive name={name} value={String(value)} />;
  }

  if (Array.isArray(value)) {
    return (
      <details open>
        <summary style={{ cursor: "pointer" }}>
          {name !== undefined ? `${name}: ` : ""}
          Array [{value.length}]
        </summary>

        <div style={{ paddingLeft: "20px" }}>
          {value.map((item, index) => (
            <JsonNode key={index} name={String(index)} value={item} />
          ))}
        </div>
      </details>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);

    return (
      <details open>
        <summary style={{ cursor: "pointer" }}>
          {name !== undefined ? `${name}: ` : ""}
          Object {"{"}
          {entries.length}
          {"}"}
        </summary>

        <div style={{ paddingLeft: "20px" }}>
          {entries.map(([key, child]) => (
            <JsonNode key={key} name={key} value={child} />
          ))}
        </div>
      </details>
    );
  }

  return <Primitive name={name} value={String(value)} />;
}

function Primitive({
  name,
  value,
}: {
  name?: string;
  value: string;
}): JSX.Element {
  return (
    <div
      style={{
        padding: "2px 0",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
      }}
    >
      {name !== undefined && (
        <span style={{ color: "var(--vscode-symbolIcon-propertyForeground)" }}>
          {name}:{" "}
        </span>
      )}
      <span>{value}</span>
    </div>
  );
}
