import { JSX } from "react";

type Props = {
  html: string;
  focused: boolean;
  onToggleFocus: () => void;
};

export function HtmlView({ html, focused, onToggleFocus }: Props): JSX.Element {
  return (
    <div
      style={{
        position: "relative",
        minHeight: focused ? "80vh" : "200px",
      }}
    >
      <button type="button" onClick={onToggleFocus} style={focusButtonStyle}>
        {focused ? "Exit focus" : "Expand"}
      </button>

      <div
        style={{
          minHeight: focused ? "80vh" : "200px",
          overflow: "auto",
          padding: "12px",
        }}
        dangerouslySetInnerHTML={{
          __html: html,
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
