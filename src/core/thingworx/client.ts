import http from "node:http";
import { Config } from "../../config";

export type ThingworxFetchOptions = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  endpoint: string;
  headers?: Record<string, string | readonly string[]>;
  body?: unknown;
};
/**
 * HTTP wrapper for the ThingWorx REST API. Attaches the application key,
 * serializes request bodies as JSON, and maps network failures / non-OK
 * responses to readable errors. Returns parsed JSON, plain text for HTML
 * responses, or `undefined` for empty bodies.
 */
export async function thingworxFetch(
  config: Config,
  options: ThingworxFetchOptions,
): Promise<unknown> {
  const url = new URL(options.endpoint, config.baseUrl);

  const headers: typeof options.headers = {
    appKey: config.appKey,
    Accept: "application/json",
    "x-thingworx-session": "false",
    ...options.headers,
  };

  if (options.method === "POST" || options.method === "PUT") {
    headers["Content-Type"] = "application/json";
  }

  let body: string | undefined;

  if (options.body) {
    body = JSON.stringify(options.body);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: options.method,
      headers,
      body,
    });
  } catch (error) {
    throw new Error(
      `ThingWorx network error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const text = await response.text();
    let message = `ThingWorx request failed (${response.status} ${http.STATUS_CODES[response.status]})`;

    if (text) {
      message += `: ${text}`;
    }

    throw new Error(message);
  }

  const contentType = response.headers.get("Content-Type");

  if (contentType?.includes("application/json")) {
    return await response.json();
  } else if (contentType?.includes("text/html")) {
    return await response.text();
  }

  return;
}
