import { JSX, useEffect, useState } from "react";
import { vscodeApi } from "./vscode-api";
import {
  ServiceInvocationViewModel,
  WebviewMessage,
} from "../shared/service-invocation-result";
import { ResultHeader } from "./components/ResultHeader";
import { RequestView } from "./components/RequestView";
import { ResponseView } from "./components/ResponseView";

export function App(): JSX.Element {
  const [content, setContent] = useState<ServiceInvocationViewModel | null>(
    null,
  );

  useEffect(() => {
    const handler = (event: MessageEvent<WebviewMessage>): void => {
      if (event.data?.type === "result") {
        setContent(event.data.content);
      }
    };

    window.addEventListener("message", handler);

    vscodeApi.postMessage({
      type: "ready",
    });

    return (): void => window.removeEventListener("message", handler);
  }, []);

  if (!content) {
    return (
      <div
        style={{
          padding: "16px",
          color: "var(--vscode-descriptionForeground)",
          fontFamily: "var(--vscode-font-family)",
        }}
      >
        Waiting for a result…
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "12px 16px",
        color: "var(--vscode-foreground)",
        fontFamily: "var(--vscode-font-family)",
        fontSize: "var(--vscode-font-size)",
      }}
    >
      <ResultHeader
        thingName={content.thingName}
        serviceName={content.serviceName}
        status={content.status}
      />

      <RequestView params={content.request.params} />

      <ResponseView
        response={content.response}
        returnType={content.returnType}
      />
    </div>
  );
}
