import { JSX, useMemo, useState } from "react";
import { FormattedResponse } from "../../shared/service-invocation-result";
import { TableView } from "./TableView";
import { JsonView } from "./JsonView";
import { HtmlView } from "./HtmlView";
import { EChartView } from "./EChartView";

type Props = {
  response: FormattedResponse;
  returnType: string;
};

type Tab = "table" | "json" | "html" | "echart";

export function ResponseView({ response, returnType }: Props): JSX.Element {
  const defaultTab: Tab =
    response.kind === "table"
      ? "table"
      : response.kind === "nothing"
        ? "table"
        : "json";

  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);

  const [focused, setFocused] = useState(false);

  const specialViews = useMemo(() => {
    return {
      html:
        returnType === "HTML" &&
        response.kind === "table" &&
        response.columns.length === 1 &&
        response.rows.length === 1,

      echart:
        returnType === "JSON" &&
        response.kind === "json" &&
        isEChartOption(response.value),
    };
  }, [response, returnType]);

  if (response.kind === "nothing") {
    return <></>;
  }

  const isTable = response.kind === "table";

  const jsonValue =
    response.kind === "table"
      ? {
          dataShape: {
            fieldDefinitions: Object.fromEntries(
              response.columns.map((column, index) => [
                column.name,
                {
                  name: column.name,
                  baseType: column.baseType,
                  ordinal: index,
                },
              ]),
            ),
          },
          rows: response.rows,
        }
      : response.kind === "json"
        ? response.value
        : undefined;

  const content = (
    <>
      {activeTab === "table" && response.kind === "table" && (
        <TableView columns={response.columns} rows={response.rows} />
      )}

      {activeTab === "json" && jsonValue !== undefined && (
        <JsonView value={jsonValue} />
      )}

      {activeTab === "html" &&
        specialViews.html &&
        response.kind === "table" && (
          <HtmlView
            html={getSingleTableValue(response)}
            focused={focused}
            onToggleFocus={() => setFocused((value) => !value)}
          />
        )}

      {activeTab === "echart" &&
        specialViews.echart &&
        response.kind === "json" && (
          <EChartView
            option={response.value}
            focused={focused}
            onToggleFocus={() => setFocused((value) => !value)}
          />
        )}
    </>
  );

  if (focused) {
    return (
      <section>
        {activeTab === "html" &&
          specialViews.html &&
          response.kind === "table" && (
            <HtmlView
              html={getSingleTableValue(response)}
              focused={focused}
              onToggleFocus={() => setFocused((value) => !value)}
            />
          )}

        {activeTab === "echart" &&
          specialViews.echart &&
          response.kind === "json" && (
            <EChartView
              option={response.value}
              focused={focused}
              onToggleFocus={() => setFocused((value) => !value)}
            />
          )}
      </section>
    );
  }

  return (
    <section>
      <h3
        style={{
          margin: "0 0 8px 0",
          fontSize: "var(--vscode-font-size)",
        }}
      >
        Response
      </h3>

      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--vscode-panel-border)",
          marginBottom: "8px",
        }}
      >
        {isTable && (
          <TabButton
            active={activeTab === "table"}
            onClick={() => setActiveTab("table")}
          >
            Table
          </TabButton>
        )}

        <TabButton
          active={activeTab === "json"}
          onClick={() => setActiveTab("json")}
        >
          JSON
        </TabButton>

        {specialViews.html && (
          <TabButton
            active={activeTab === "html"}
            onClick={() => setActiveTab("html")}
          >
            HTML
          </TabButton>
        )}

        {specialViews.echart && (
          <TabButton
            active={activeTab === "echart"}
            onClick={() => setActiveTab("echart")}
          >
            EChart
          </TabButton>
        )}
      </div>

      <div
        style={{
          border: "1px solid var(--vscode-panel-border)",
          padding: "8px 12px",
        }}
      >
        {content}
      </div>
    </section>
  );
}

type TabButtonProps = {
  active: boolean;
  onClick: () => void;
  children: string;
};

function TabButton({ active, onClick, children }: TabButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        borderBottom: active
          ? "2px solid var(--vscode-focusBorder)"
          : "2px solid transparent",
        background: "transparent",
        color: active
          ? "var(--vscode-foreground)"
          : "var(--vscode-descriptionForeground)",
        padding: "6px 12px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function getSingleTableValue(
  response: Extract<FormattedResponse, { kind: "table" }>,
): string {
  const column = response.columns[0];

  if (!column || response.rows.length === 0) {
    return "";
  }

  const value = response.rows[0]?.[column.name];

  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value as string);
}

function isEChartOption(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    Array.isArray(candidate.series) &&
    ("xAxis" in candidate ||
      "yAxis" in candidate ||
      "radar" in candidate ||
      "parallel" in candidate ||
      "calendar" in candidate ||
      "geo" in candidate)
  );
}
