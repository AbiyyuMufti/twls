import * as vscode from "vscode";
import { Config } from "../../config";
import { EntityMeta } from "../../core/entity/entity";
import { ProjectMeta } from "../../core/entity/project";
import {
  buildEntityPickItem,
  buildProjectPickItem,
  type MetaPickItem,
} from "./pick-item";
import {
  searchEntityMeta,
  searchProjectMeta,
} from "../../core/thingworx/search";

/**
 * Opens a QuickPick that live-searches entities and resolves to the picked
 * {@link EntityMeta} (or `undefined` when the picker is dismissed).
 */
export function showEntityMetaPick(
  config: Config,
  options: Pick<vscode.QuickPickOptions, "placeHolder" | "ignoreFocusOut">,
): Promise<EntityMeta | undefined> {
  return showMetaQuickPick<EntityMeta>(
    (searchExpression) => searchEntityMeta(config, searchExpression),
    (meta) => buildEntityPickItem(meta, config.entityName),
    options,
  );
}

/**
 * Opens a QuickPick that live-searches projects and resolves to the picked
 * {@link ProjectMeta} (or `undefined` when the picker is dismissed).
 */
export function showProjectMetaPick(
  config: Config,
  options: Pick<vscode.QuickPickOptions, "placeHolder" | "ignoreFocusOut">,
): Promise<ProjectMeta | undefined> {
  return showMetaQuickPick<ProjectMeta>(
    (searchExpression) => searchProjectMeta(config, searchExpression),
    (meta) => buildProjectPickItem(meta),
    options,
  );
}

/**
 * Shared QuickPick harness used by the entity/project pickers. It debounces
 * the search box, discards stale results, and keeps the picker open when a
 * search fails (surfacing the error as a toast) instead of rejecting.
 */
function showMetaQuickPick<TMeta>(
  performSearch: (searchExpression: string) => Promise<TMeta[]>,
  buildItem: (meta: TMeta) => MetaPickItem<TMeta> | undefined,
  options: Pick<vscode.QuickPickOptions, "placeHolder" | "ignoreFocusOut">,
): Promise<TMeta | undefined> {
  const DEBOUNCE_DELAY_MS = 300;

  return new Promise<TMeta | undefined>((resolve) => {
    const quickPick = vscode.window.createQuickPick<MetaPickItem<TMeta>>();
    let debounceTimer: NodeJS.Timeout | undefined;
    let latestSearchId = 0;
    let settled = false;
    let lastErrorShown: string | undefined;

    function settle(result: TMeta | undefined): void {
      if (settled) {
        return;
      }
      settled = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      quickPick.dispose();
      resolve(result);
    }

    async function search(searchExpression: string): Promise<void> {
      const searchId = ++latestSearchId;
      quickPick.busy = true;

      try {
        const metas = await performSearch(searchExpression);
        if (settled || searchId !== latestSearchId) {
          return;
        }
        lastErrorShown = undefined;
        quickPick.items = metas.flatMap((meta) => {
          const item = buildItem(meta);
          return item ? [item] : [];
        });
      } catch (error) {
        if (settled || searchId !== latestSearchId) {
          return;
        }
        // A failed search keeps the picker open: clear results and surface the
        // error as a transient toast (deduped per failure streak) instead of
        // rejecting the pick promise silently.
        quickPick.items = [];
        const message =
          error instanceof Error
            ? error.message
            : `Search failed: ${String(error)}`;
        if (message !== lastErrorShown) {
          lastErrorShown = message;
          void vscode.window.showErrorMessage(message);
        }
      } finally {
        if (!settled && searchId === latestSearchId) {
          quickPick.busy = false;
        }
      }
    }

    quickPick.onDidChangeValue((e) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        void search(e + "*");
      }, DEBOUNCE_DELAY_MS);
    });

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        settle(selected);
      }
    });

    quickPick.onDidHide(() => {
      settle(undefined);
    });

    if (options.placeHolder) {
      quickPick.placeholder = options.placeHolder;
    }

    if (options.ignoreFocusOut) {
      quickPick.ignoreFocusOut = options.ignoreFocusOut;
    }

    void search("*");
    quickPick.show();
  });
}
