import { JSX, useState } from "react";
import { TableColumn } from "../../shared/service-invocation-result";
import { JsonView } from "./JsonView";

type Props = {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
};

export function TableView({ columns, rows }: Props): JSX.Element {
  return (
    <div
      style={{
        overflowX: "auto",
      }}
    >
      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
        }}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.name} style={headerStyle}>
                {column.name}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column.name} style={cellStyle}>
                  <Cell value={row[column.name]} baseType={column.baseType} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type CellProps = {
  value: unknown;
  baseType: string;
};

function Cell({ value, baseType }: CellProps): JSX.Element {
  switch (baseType) {
    case "BOOLEAN":
      return <BooleanCell value={value} />;

    case "HTML":
      return <HtmlCell value={value} />;

    case "JSON":
      return <JsonCell value={value} />;

    case "DATETIME":
      return <DateTimeCell value={value} />;

    default:
      return <PrimitiveCell value={value} />;
  }
}

function PrimitiveCell({ value }: { value: unknown }): JSX.Element {
  return <span>{formatValue(value)}</span>;
}

function BooleanCell({ value }: { value: unknown }): JSX.Element {
  const [pretty, setPretty] = useState(true);

  const booleanValue =
    typeof value === "boolean" ? value : String(value).toLowerCase() === "true";

  return (
    <CellWithToggle
      pretty={pretty}
      onToggle={() => setPretty((current) => !current)}
    >
      {pretty ? (
        <input
          type="checkbox"
          checked={booleanValue}
          readOnly
          aria-label={String(booleanValue)}
        />
      ) : (
        <span>{String(value)}</span>
      )}
    </CellWithToggle>
  );
}

function HtmlCell({ value }: { value: unknown }): JSX.Element {
  const [pretty, setPretty] = useState(true);

  const html = typeof value === "string" ? value : "";
  return (
    <CellWithToggle
      pretty={pretty}
      onToggle={() => setPretty((current) => !current)}
    >
      {pretty ? (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <span
          style={{
            whiteSpace: "pre-wrap",
            fontFamily: "var(--vscode-editor-font-family)",
          }}
        >
          {html}
        </span>
      )}
    </CellWithToggle>
  );
}

function JsonCell({ value }: { value: unknown }): JSX.Element {
  return <JsonView value={value} />;
}

function DateTimeCell({ value }: { value: unknown }): JSX.Element {
  const [mode, setMode] = useState<"epoch" | "local" | "iso">("epoch");

  const date = toDate(value);

  if (!date) {
    return <PrimitiveCell value={value} />;
  }

  const displayValue =
    mode === "epoch"
      ? String(date.getTime())
      : mode === "local"
        ? date.toLocaleString()
        : date.toISOString();

  return (
    <CellWithToggle
      pretty={mode !== "epoch"}
      onToggle={() =>
        setMode((current) => {
          if (current === "epoch") {
            return "local";
          }

          if (current === "local") {
            return "iso";
          }

          return "epoch";
        })
      }
    >
      <span
        style={{
          whiteSpace: "nowrap",
          fontFamily:
            mode === "epoch" ? "var(--vscode-editor-font-family)" : undefined,
        }}
      >
        {displayValue}
      </span>
    </CellWithToggle>
  );
}

type CellWithToggleProps = {
  pretty: boolean;
  onToggle: () => void;
  children: JSX.Element;
};

function CellWithToggle({
  pretty,
  onToggle,
  children,
}: CellWithToggleProps): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
      }}
    >
      {children}

      <button
        type="button"
        onClick={onToggle}
        title="Toggle display"
        style={{
          border: "none",
          background: "transparent",
          color: "var(--vscode-descriptionForeground)",
          cursor: "pointer",
          padding: "1px 3px",
          fontSize: "11px",
        }}
      >
        {pretty ? "raw" : "pretty"}
      </button>
    </div>
  );
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  if (typeof value === "string") {
    const numericValue = Number(value);

    if (!Number.isNaN(numericValue)) {
      const date = new Date(numericValue);

      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  return undefined;
}

function formatValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value as string);
}

const headerStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid var(--vscode-panel-border)",
  whiteSpace: "nowrap",
};

const cellStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--vscode-panel-border)",
  verticalAlign: "top",
};
