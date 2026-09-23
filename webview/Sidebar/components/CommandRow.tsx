import { ReactNode } from "react";
import { vscodeApi } from "../../vscode-api";

interface CommandRowProps {
  icon: string;
  label: string;
  command: string;
}

function CommandRow({ icon, label, command }: CommandRowProps): ReactNode {
  const execute = (): void => {
    vscodeApi.postMessage({
      type: "executeCommand",
      command,
    });
  };

  return (
    <button className="command-row" onClick={execute}>
      <span className="command-icon">{icon}</span>
      <span className="command-label">{label}</span>
    </button>
  );
}

export default CommandRow;
