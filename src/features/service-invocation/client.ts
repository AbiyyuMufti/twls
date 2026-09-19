import { Config } from "../../config";

export type ServiceInvocationResult = {
  status: number;
  statusText: string;
  ok: boolean;
  rawBody: string;
  jsonBody: unknown;
};

export async function invokeThingService(
  config: Config,
  thingName: string,
  serviceName: string,
  params: Record<string, unknown>,
): Promise<ServiceInvocationResult> {
  const url = new URL(
    `/Thingworx/Things/${thingName}/Services/${serviceName}`,
    config.baseUrl,
  );

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        appKey: config.appKey,
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-thingworx-session": "false",
      },
      body: JSON.stringify(params),
    });
  } catch (error) {
    throw new Error(
      `ThingWorx network error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const rawBody = await response.text();

  let jsonBody: unknown;
  try {
    jsonBody = rawBody ? JSON.parse(rawBody) : undefined;
  } catch {
    jsonBody = undefined;
  }

  return {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    rawBody,
    jsonBody,
  };
}
