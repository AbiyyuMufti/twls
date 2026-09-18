import z from "zod";
const projectParentTypes = {
  Project: "Projects",
} as const;

const projectTypes = Object.keys(projectParentTypes) as unknown as readonly [
  keyof typeof projectParentTypes,
];

const projParentTypes = Object.values(
  projectParentTypes,
) as unknown as readonly [
  (typeof projectParentTypes)[keyof typeof projectParentTypes],
];

/** Identifies a ThingWorx project, the container that entities are grouped in. */
export const projectMetaSchema = z.object({
  name: z.string(),
  projectName: z.string(),
  type: z.enum(projectTypes),
  parentType: z.enum(projParentTypes),
});

export type ProjectMeta = z.infer<typeof projectMetaSchema>;
