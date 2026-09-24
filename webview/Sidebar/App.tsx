import { ReactNode, useEffect, useState } from "react";
import "./styles.css";
import { vscodeApi } from "../vscode-api";
import Section from "./components/Section";
import CommandRow from "./components/CommandRow";
import { ServiceInvocationPanel } from "./components/ServiceInvocationPanel";

interface SidebarService {
  name: string;
  description?: string;
}

interface ServicesMessage {
  type: "services";
  services: SidebarService[];
}

export function App(): ReactNode {
  const [services, setServices] = useState<SidebarService[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ServicesMessage>): void => {
      if (event.data.type !== "services") {
        return;
      }

      setServices(event.data.services);
    };

    window.addEventListener("message", handleMessage);

    vscodeApi.postMessage({
      type: "getServices",
    });

    return (): void => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return (
    <main className="sidebar">
      <header className="header">
        <div className="brand">
          <div className="brand-icon">◈</div>

          <div>
            <div className="brand-title">TWLS</div>
            <div className="brand-subtitle">ThingWorx Local Service</div>
          </div>
        </div>
      </header>

      <div className="divider" />

      <Section title="Connection">
        <div className="connection-card">
          <div className="connection-status">
            <span className="status-dot" />
            <span>Connected</span>
          </div>

          <div className="connection-detail">ThingWorx server</div>

          <div className="connection-detail entity">TestTiming</div>
        </div>

        <CommandRow
          icon="⇄"
          label="Switch Entity"
          command="twls.switchEntity"
        />
      </Section>

      <Section title="Sync">
        <CommandRow icon="↓" label="Pull" command="twls.pull" />

        <CommandRow icon="↓" label="Pull Project" command="twls.pullProject" />

        <CommandRow icon="↑" label="Push" command="twls.push" />
      </Section>

      <Section title="Changes">
        <CommandRow icon="↶" label="Discard Changes" command="twls.discard" />
      </Section>

      <Section title="Stash">
        <CommandRow icon="+" label="Stash Changes" command="twls.stash" />

        <CommandRow icon="☷" label="Stash List" command="twls.stashList" />

        <CommandRow icon="↳" label="Apply Latest" command="twls.stashApply" />

        <CommandRow icon="↳" label="Pop Latest" command="twls.stashPop" />
      </Section>

      <Section title="Services" defaultOpen>
        {/* <CommandRow icon="+" label="New Service" command="twls.newService" /> */}
        {/* <CommandRow icon="▶" label="Call Service" command="twls.callService" /> */}
        <ServiceInvocationPanel services={services}></ServiceInvocationPanel>
      </Section>
    </main>
  );
}
