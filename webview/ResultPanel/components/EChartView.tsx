import { JSX, useEffect, useRef } from "react";
import * as echarts from "echarts";

type Props = {
  option: unknown;
  focused: boolean;
  onToggleFocus: () => void;
};

export function EChartView({
  option,
  focused,
  onToggleFocus,
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = echarts.init(containerRef.current);

    chart.setOption(option as echarts.EChartsOption);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });

    resizeObserver.observe(containerRef.current);

    return (): void => {
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, [option]);

  return (
    <div
      style={{
        position: "relative",
        minHeight: focused ? "80vh" : "400px",
      }}
    >
      <button type="button" onClick={onToggleFocus} style={focusButtonStyle}>
        {focused ? "Exit focus" : "Expand"}
      </button>

      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: focused ? "80vh" : "400px",
        }}
      />
    </div>
  );
}

const focusButtonStyle = {
  position: "absolute" as const,
  top: "4px",
  right: "4px",
  zIndex: 1,
  border: "1px solid var(--vscode-button-border)",
  background: "var(--vscode-button-background)",
  color: "var(--vscode-button-foreground)",
  padding: "4px 8px",
  cursor: "pointer",
};
