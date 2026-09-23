/**
 * Base types confirmed against real ThingWorx payloads so far. This is a
 * soft authoring hint only — NOT enforced as a hard enum anywhere on the
 * underlying `serviceDefinitionSchema`, since rejecting an unconfirmed base
 * type would break parsing for a real entity using one we haven't seen yet.
 */
export const KNOWN_BASE_TYPES = [
  "STRING",
  "NUMBER",
  "INTEGER",
  "BOOLEAN",
  "DATETIME",
  "INFOTABLE",
  "NOTHING",
  "JSON",
  "HTML",
  "XML",
] as const;

export type KnownBaseType = (typeof KNOWN_BASE_TYPES)[number];
