import z from "zod";

/** Local on-disk service artifact shape. */
export const localServiceSchema = z.object({
  name: z.string(),
  source: z.string(),
  extension: z.enum([".js", ".sql"]),
});

export type Service = z.infer<typeof localServiceSchema>;

/** Glob for watching all service files (`.js` and `.sql`) under a root. */
export function getServiceExtensionPattern(): string {
  const s = localServiceSchema.shape.extension.options
    .map((ext) => ext.slice(1))
    .join(",");
  return `**/*.{${s}}`;
}
