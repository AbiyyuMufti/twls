import * as vscode from "vscode";
import { CommandRunner } from "../../command-runner";
import { ThingSearchRow } from "../../core/entity/thing-search";
import { searchThingsForEntity } from "../../core/thingworx/search";
import { FeatureCommands } from "../../feature-commands";
import { logger } from "../../logger";
import { Repository } from "../sync/repository";
import { invokeThingService } from "./client";
import {
  buildServiceInvocationStub,
  // formatServiceInvocationResult,
  formatServiceInvocationView,
  parseServiceInvocationParams,
} from "./format";
import { ResultPanel } from "./result-panel";
/**
 * Registers `twls.callService`: a manual, Postman-style command to invoke a
 * service on a live Thing and show the result.
 */
export class ServiceInvocationCommands implements FeatureCommands {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private runner: CommandRunner,
    private extensionUri: vscode.Uri,
  ) {
    this.disposables.push(
      vscode.commands.registerCommand("twls.callService", () => {
        this.runner.run("Call Service", () => this.callService());
      }),
    );
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
    const repo = await this.runner.resolveRepository();

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
    if (!definition) {
      throw new Error("Service doesnt contains service definitions");
    }
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

    // const content = formatServiceInvocationResult(
    //   thingName,
    //   servicePick.label,
    //   params,
    //   result,
    // );

    // const document = await vscode.workspace.openTextDocument({
    //   content,
    //   language: "jsonc",
    // });
    // await vscode.window.showTextDocument(document, { preview: true });

    const serviceOutput = definition.resultType.baseType;

    const viewModel = formatServiceInvocationView(
      thingName,
      servicePick.label,
      serviceOutput,
      params,
      result,
    );

    ResultPanel.show(this.extensionUri, viewModel);

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
