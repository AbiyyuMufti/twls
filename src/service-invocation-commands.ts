import * as vscode from "vscode";
import { logger } from "./logger";
import { Model } from "./features/sync/model";
import { Repository } from "./features/sync/repository";
import { invokeThingService, searchThingsForEntity } from "./thingworx";
import {
  buildServiceInvocationStub,
  formatServiceInvocationResult,
  parseServiceInvocationParams,
} from "./service-invocation";
import { ThingSearchRow } from "./entity/zod-thing-search";

/**
 * Registers `twls.callService`: a manual, Postman-style command to invoke a
 * service on a live Thing and show the result. Kept separate from
 * `Commands` so this new/experimental feature doesn't touch existing
 * command wiring.
 */
export class ServiceInvocationCommands implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(private model: Model) {
    this.disposables.push(
      vscode.commands.registerCommand("twls.callService", () => {
        this.callService().catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error(`Call Service failed: ${message}`, error);
          void vscode.window.showErrorMessage(message);
        });
      }),
    );
  }

  private async resolveRepository(): Promise<Repository | undefined> {
    return this.model.showRepositoryPick({
      placeHolder: "Pick repository",
      ignoreFocusOut: true,
    });
  }

  /**
   * Picks a Thing that implements the repo's active entity via
   * {@link searchThingsForEntity}. Falls back to manual entry if the search
   * comes back empty or fails outright — search failing shouldn't block the
   * whole command, since ThingWorx search/permissions setups vary.
   */
  private async pickThingName(repo: Repository): Promise<string | undefined> {
    let things: ThingSearchRow[] = [];

    try {
      things = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Searching Things implementing ${repo.entity.meta.name}…`,
        },
        () => searchThingsForEntity(repo.config, repo.entity.meta),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        `Thing search failed, falling back to manual entry: ${message}`,
      );
    }

    if (things.length === 0) {
      return vscode.window.showInputBox({
        prompt: `Thing that implements ${repo.entity.meta.name} — services aren't directly invocable on a ${repo.entity.meta.type}`,
        placeHolder: "e.g. TestTiming",
        ignoreFocusOut: true,
        validateInput: (value) =>
          value ? undefined : "Thing name is required.",
      });
    }

    const ENTER_MANUALLY = "Enter manually…";
    const picked = await vscode.window.showQuickPick(
      [
        ...things.map((thing) => ({
          label: thing.name,
          description: thing.type,
        })),
        { label: ENTER_MANUALLY },
      ],
      {
        placeHolder: `Pick a Thing implementing ${repo.entity.meta.name}`,
        ignoreFocusOut: true,
      },
    );

    if (!picked) {
      return undefined;
    }

    if (picked.label === ENTER_MANUALLY) {
      return vscode.window.showInputBox({
        prompt: "Thing name",
        ignoreFocusOut: true,
        validateInput: (value) =>
          value ? undefined : "Thing name is required.",
      });
    }

    return picked.label;
  }

  private async callService(): Promise<void> {
    const repo = await this.resolveRepository();

    if (!repo) {
      return;
    }

    const services = repo.entity.getServices();

    if (services.length === 0) {
      void vscode.window.showWarningMessage(
        `${repo.entity.meta.name} has no services to call.`,
      );
      return;
    }

    const servicePick = await vscode.window.showQuickPick(
      services
        .map((service) => ({
          label: service.name,
          description: service.extension,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      { placeHolder: "Pick a service to call", ignoreFocusOut: true },
    );

    if (!servicePick) {
      return;
    }

    const thingName = await this.pickThingName(repo);
    if (!thingName) {
      return;
    }

    const definition = repo.entity.getServiceDefinition(servicePick.label);
    const stub = buildServiceInvocationStub(definition);

    const rawParams = await vscode.window.showInputBox({
      prompt: `Parameters for ${servicePick.label} (JSON)`,
      value: stub,
      ignoreFocusOut: true,
    });

    if (rawParams === undefined) {
      return;
    }

    const params = parseServiceInvocationParams(rawParams);

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Calling ${thingName}.${servicePick.label}…`,
      },
      () =>
        invokeThingService(repo.config, thingName, servicePick.label, params),
    );

    logger.info(
      `${servicePick.label} on ${thingName}: ${result.status} ${result.statusText}`,
    );

    const content = formatServiceInvocationResult(
      thingName,
      servicePick.label,
      params,
      result,
    );

    const document = await vscode.workspace.openTextDocument({
      content,
      language: "jsonc",
    });
    await vscode.window.showTextDocument(document, { preview: true });

    if (!result.ok) {
      void vscode.window.showWarningMessage(
        `${servicePick.label} returned ${result.status} ${result.statusText}. See the opened result for details.`,
      );
    }
  }

  dispose(): void {
    this.disposables.forEach((disposable) => {
      disposable.dispose();
    });
  }
}
