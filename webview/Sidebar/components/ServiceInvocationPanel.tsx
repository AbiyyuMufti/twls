import { JSX, useState } from "react";
import { KnownBaseType } from "../../../shared/thingworx-types";
import { ServiceParameterInput } from "./ServiceParameterInput";

interface SidebarService {
  name: string;
  description?: string;
}

interface ServiceInvocationPanelProps {
  services: SidebarService[];
}

export function ServiceInvocationPanel({
  services,
}: ServiceInvocationPanelProps): JSX.Element {
  const [selectedService, setSelectedService] = useState("");
  const [parameterType, setParameterType] = useState<KnownBaseType>("STRING");
  const [value, setValue] = useState<unknown>(undefined);

  return (
    <div className="service-invocation-panel">
      <select
        value={selectedService}
        onChange={(event) => {
          setSelectedService(event.target.value);
          setValue(undefined);
        }}
      >
        <option value="">Select a service to run…</option>

        {services.map((service) => (
          <option key={service.name} value={service.name}>
            {service.name}
          </option>
        ))}
      </select>

      {selectedService && (
        <div className="service-parameters">
          <div className="service-parameter">
            <label>Parameter</label>

            <select
              value={parameterType}
              onChange={(event) => {
                setParameterType(event.target.value as KnownBaseType);
                setValue(undefined);
              }}
            >
              {[
                "STRING",
                "NUMBER",
                "INTEGER",
                "BOOLEAN",
                "DATETIME",
                "JSON",
                "HTML",
                "XML",
                "INFOTABLE",
                "NOTHING",
              ].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            <ServiceParameterInput
              type={parameterType}
              value={value}
              onChange={setValue}
            />
          </div>
        </div>
      )}
    </div>
  );
}
