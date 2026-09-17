import * as vscode from "vscode";
import { normalizeEol } from "./text";
import { ArtifactKind, buildArtifactFolderRelativePath } from "./artifact-path";
import { EntityMeta } from "./entity/entity";
import {
  CaseCollisionGroup,
  groupByCaseInsensitiveName,
} from "./utilities/case-collision";
import { pickPreferredName } from "./utilities/case-style";
import { logger } from "./logger";

export interface CaseWarnArtifact {
  name: string;
  extension: string;
  source: string;
  /** Human label for the file kind, e.g. "code file" or "definition". */
  label: string;
}

interface ExtensionFinding {
  label: string;
  onDiskFilename: string;
  writtenName: string | undefined;
  lostNames: string;
}

/**
 * Warns (without touching disk) when names differ only by letter case and
 * collided into one file. Findings across file types (code + `.yaml`
 * definition) sharing the same logical name are merged into a single toast.
 */
export async function warnCaseCollisions(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
  kind: ArtifactKind,
  artifacts: readonly CaseWarnArtifact[],
): Promise<void> {
  const nameGroups = groupByCaseInsensitiveName(artifacts);

  for (const group of nameGroups) {
    await warnOneNameGroup(rootUri, entityMeta, kind, group);
  }
}

async function warnOneNameGroup(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
  kind: ArtifactKind,
  group: CaseCollisionGroup<CaseWarnArtifact>,
): Promise<void> {
  const preferred = pickPreferredName(group.members);

  if (!preferred) {
    return;
  }

  const folderUri = vscode.Uri.joinPath(
    rootUri,
    ...buildArtifactFolderRelativePath(entityMeta, kind),
  );

  const byExtension = new Map<string, CaseWarnArtifact[]>();
  for (const member of group.members) {
    const existing = byExtension.get(member.extension);
    if (existing) {
      existing.push(member);
    } else {
      byExtension.set(member.extension, [member]);
    }
  }

  const findings: ExtensionFinding[] = [];

  for (const [extension, members] of byExtension) {
    if (new Set(members.map((member) => member.name)).size <= 1) {
      continue; // this file type alone doesn't collide, even though the logical name does
    }

    const finding = await resolveExtensionFinding(
      folderUri,
      extension,
      members,
    );
    if (finding) {
      findings.push(finding);
    }
  }

  if (findings.length === 0) {
    return;
  }

  const allNames = group.members.map((member) => member.name).join(" / ");
  const fileLines = findings
    .map(
      (finding) =>
        `${finding.label} (${finding.onDiskFilename}): kept "${
          finding.writtenName ?? "neither exactly"
        }", lost "${finding.lostNames}"`,
    )
    .join("; ");

  const keptPreferredEverywhere = findings.every(
    (finding) => finding.writtenName === preferred.name,
  );

  const conventionNote = keptPreferredEverywhere
    ? ""
    : ` Your team uses PascalCase — "${preferred.name}" should be the one kept.`;

  const warning =
    `"${allNames}" differ only by letter case and collide on disk: ${fileLines}. ` +
    `Affected files will show an incorrect diff in source control until resolved.${conventionNote}`;

  logger.warn(warning);
  void vscode.window.showWarningMessage(warning);
}

async function resolveExtensionFinding(
  folderUri: vscode.Uri,
  extension: string,
  members: readonly CaseWarnArtifact[],
): Promise<ExtensionFinding | undefined> {
  const [first] = members;

  if (!first) {
    return undefined;
  }

  const onDiskFilename = await findOnDiskFilename(
    folderUri,
    first.name.toLowerCase() + extension.toLowerCase(),
  );

  if (!onDiskFilename) {
    return undefined;
  }

  const onDiskUri = vscode.Uri.joinPath(folderUri, onDiskFilename);

  let onDiskContent: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(onDiskUri);
    onDiskContent = normalizeEol(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }

  const written = members.find(
    (member) => normalizeEol(member.source) === onDiskContent,
  );
  const lostNames = members
    .filter((member) => member !== written)
    .map((member) => member.name)
    .join(", ");

  return {
    label: first.label,
    onDiskFilename,
    writtenName: written?.name,
    lostNames,
  };
}

async function findOnDiskFilename(
  folderUri: vscode.Uri,
  lowercaseKey: string,
): Promise<string | undefined> {
  let entries: [string, vscode.FileType][];

  try {
    entries = await vscode.workspace.fs.readDirectory(folderUri);
  } catch {
    return undefined;
  }

  const match = entries.find(([name]) => name.toLowerCase() === lowercaseKey);
  return match ? match[0] : undefined;
}
