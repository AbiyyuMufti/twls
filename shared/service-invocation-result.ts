export type FieldDefinition = {
  name: string;
  description: string;
  baseType: string;
  ordinal: number;
  aspects: Record<string, unknown>;
};

export type InfoTableResult = {
  dataShape: {
    fieldDefinitions: Record<string, FieldDefinition>;
  };
  rows: Record<string, unknown>[];
};

export type TableColumn = {
  name: string;
  baseType: string;
};

export type FormattedResponse =
  | {
      kind: "table";
      columns: TableColumn[];
      rows: Record<string, unknown>[];
    }
  | {
      kind: "json";
      value: unknown;
    }
  | {
      kind: "text";
      value: string;
    }
  | {
      kind: "nothing";
    };

export type ServiceInvocationViewModel = {
  status: {
    ok: boolean;
    code: number;
    text: string;
  };

  thingName: string;
  serviceName: string;
  returnType: string;

  request: {
    params: Record<string, unknown>;
  };

  response: FormattedResponse;
};

export type WebviewMessage = {
  type: "result";
  content: ServiceInvocationViewModel;
};

export function isInfoTableResult(value: unknown): value is InfoTableResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("dataShape" in value) || !("rows" in value)) {
    return false;
  }

  if (typeof value.dataShape !== "object" || value.dataShape === null) {
    return false;
  }

  if (!("fieldDefinitions" in value.dataShape)) {
    return false;
  }

  if (
    typeof value.dataShape.fieldDefinitions !== "object" ||
    value.dataShape.fieldDefinitions === null
  ) {
    return false;
  }

  return Array.isArray(value.rows);
}
