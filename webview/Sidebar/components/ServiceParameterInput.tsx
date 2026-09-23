import { JSX } from "react";
import { KnownBaseType } from "../../../shared/thingworx-types";

interface ServiceParameterInputProps {
  type: KnownBaseType;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function ServiceParameterInput({
  type,
  value,
  onChange,
}: ServiceParameterInputProps): JSX.Element | null {
  switch (type) {
    case "STRING":
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case "NUMBER":
      return (
        <input
          type="number"
          step="any"
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(
              event.target.value === ""
                ? undefined
                : Number(event.target.value),
            )
          }
        />
      );

    case "INTEGER":
      return (
        <input
          type="number"
          step="1"
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(
              event.target.value === ""
                ? undefined
                : Number(event.target.value),
            )
          }
        />
      );

    case "BOOLEAN":
      return (
        <select
          value={value === true ? "true" : value === false ? "false" : ""}
          onChange={(event) => {
            if (event.target.value === "") {
              onChange(undefined);
            } else {
              onChange(event.target.value === "true");
            }
          }}
        >
          <option value="">Unknown</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      );

    case "DATETIME":
      return (
        <input
          type="datetime-local"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => {
            const localValue = event.target.value;

            if (!localValue) {
              onChange(undefined);
              return;
            }

            onChange(new Date(localValue).getTime());
          }}
        />
      );

    case "JSON":
    case "HTML":
    case "XML":
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
        />
      );

    case "INFOTABLE":
      return (
        <div className="service-parameter-unsupported">
          Infotable parameters are not supported yet.
        </div>
      );

    case "NOTHING":
      return <div className="service-parameter-none">No value required.</div>;
  }
}
