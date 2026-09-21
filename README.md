# ThingWorx Local Service (TWLS)

Edit ThingWorx services and subscriptions as local JavaScript and SQL files in VS Code, then synchronize those changes with a ThingWorx server.

TWLS turns a workspace folder into a working copy of a ThingWorx **entity** — a Thing Shape or Thing Template. Services and subscriptions are pulled into real local files: services use `.js` or `.sql`, and subscriptions use `.js`. You can uan edit these files with normal VS Code tooling, review the differences in the Source Control view, and push the changes back to ThingWorx.
Each service also has a .yaml sidecar file beside its source file. The sidecar stores the service signature, including its parameters and result type.

## Features

- **Two-way sync with ThingWorx** — pull services and subscriptions to disk, edit them locally, and push the changes back to ThingWorx.
- **Source Control integration** — modified and deleted services and subscriptions appear as changes in a dedicated _TWLS_ panel, complete with an inline diff against the remote version.
- **File-level granularity** — each service is represented by one .js or .sql file, and each subscription by one .js file. Every file is tracked independently.
- **Service Definition sidcar** — every .js or .sql service has a matching .yaml sidecar that describes its parameters and result type.
- **New service creation** — create local JavaScript or SQL service files together with their YAML service-definition sidecars.
- **Live service invocation** — invoke a service on a live Thing without modifying local source files.
- **Case-collision protection** — detect service, subscription, and service-definition names that differ only by letter case, then keep the preferred variant and warn about artifacts that cannot safely be written to a case-insensitive filesystem.
- **Project support** — pull not just one entity, but every entity that belongs to a ThingWorx project.
- **Stash support** — temporarily save local changes so you can pull remote updates without losing your work, then apply or pop those changes later.
- **Conflict protection** — refuses to push if ThingWorx has changed since your last pull, so you never silently overwrite someone else's work.
- **Clean diffs** — dirty detection normalizes line endings, so CRLF/LF differences alone don't mark a file as modified.

## Workspace structure and synchronization

1. TWLS stores its repository configuration in .twls/thingworx.json. The file identifies the ThingWorx server, application key, and active entity:

   ```json
   {
     "baseUrl": "http://localhost:8080",
     "appKey": "xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx",
     "entityName": "MyThingShape"
   }
   ```

   `entityName` is the active entity currently associated with the workspace. It can be changed later with **TWLS: Switch Entity**.

2. Services and subscriptions of that entity are written to disk under a path that mirrors ThingWorx's project structure. Services are stored in `services/`, while subscriptions are stored in `subscriptions/`.

   ```
   <workspaceFolder>/
   ├── .twls/
   │   └── thingworx.json
   └── <projectName>/
      ├── <entityName>/
      │   ├── services/
      │   │   ├── MyScriptService.js
      │   │   ├── MyScriptService.yaml
      │   │   ├── MyQueryService.sql
      │   │   └── MyQueryService.yaml
      │   └── subscriptions/
      │       └── MyScriptSubscription.js
      └── <anotherEntityName>/
         ├── services/
         └── subscriptions/
   ```

   **TWLS: Pull Project** creates one directory for each entity in the selected project under the same project directory. Each entity has its own services/ and subscriptions/ folders.

3. Each service has a `.yaml` sidecar next to its source file. The sidecar is the local authoring format for the service definition:

   ```yaml
   description: Returns the current value
   category: Services category
   params:
     - name: input
       type: STRING
       description: Value to process
   result: STRING
   ```

   For SQL-backed services, the sidecar can also contain the query settings:

   ```yaml
   timeout: 60
   maxItems: 0
   ```

   During Pull, TWLS converts the full ThingWorx service definition into this compact authoring format. During Push, TWLS expands the YAML back into the ThingWorx service-definition format and sends it together with the service source.
   TWLS adds a comment to generated YAML listing the base types currently verified by the extension.

4. TWLS compares the on-disk files against the last-known remote state and shows any differences in the Source Control view. The remote side of a diff is served as a read-only virtual document, so you always compare against the actual server content.

## Requirements and installation

- VS Code 1.108.1 or newer
- A ThingWorx instance reachable over HTTP(S) from your machine
- A ThingWorx **Application Key** with permission to read and update the entities and projects you want to manage

## Installation

TWLS is not published to the VS Code Marketplace yet, so install it from a VSIX. The maintainer publishes a `.vsix` for each release to the [repository releases page](http://192.168.7.101/team-project-3-reborn/twls/-/releases). Alternatively, build one from source:

```bash
npm install
npm run package   # produces twls-<version>.vsix
```

Then in VS Code open the **Extensions** view (`Ctrl+Shift+X`), click the `...` menu, choose **Install from VSIX...**, and select the downloaded or generated `.vsix` file.

## Usage

### Getting started

Run **TWLS: Initialize** from the Command Palette and follow the prompts:

1. Pick the workspace folder you want to use.
2. Enter your ThingWorx Base URL (e.g. `http://localhost:8080`).
3. Enter your Application Key.
4. Select a project. If no matching entities are found, select an entity manually.

TWLS writes `.twls/thingworx.json` config, and pulls the entity's services and subscriptions into the workspace, where they are ready to edit.

### Commands

All commands live in the command palette (`Ctrl+Shift+P`) under the **TWLS** category.

| Command                      | Description                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `TWLS: Initialize`           | Set up a workspace folder as a TWLS repository (see above).                                                                 |
| `TWLS: Pull`                 | Download the active entity's services and subscriptions, overwriting local files. No-op when nothing changed on the server. |
| `TWLS: Pull Project`         | Download the services and subscriptions of every entity in a project you pick.                                              |
| `TWLS: Push`                 | Upload all changed local service, service-definition, and subscription files to ThingWorx.                                  |
| `TWLS: Switch Entity`        | Point the folder at a different entity and pull its services and subscriptions in.                                          |
| `TWLS: Discard`              | Revert a single changed file back to its remote version.                                                                    |
| `TWLS: Stash Changes`        | Save all modified and deleted files in a persistent stash, then restore the working tree to its last-pulled state.          |
| `TWLS: Stash List`           | List saved stashes and choose a stash to apply or pop.                                                                      |
| `TWLS: Stash Apply (Latest)` | Apply the latest stash without removing it from the stash list.                                                             |
| `TWLS: Stash Pop (Latest)`   | Apply the latest stash and remove it from the stash list.                                                                   |
| `TWLS: New Service`          | Create local JavaScript or SQL service boilerplate together with its YAML service-definition sidecar.                       |
| `TWLS: Call Service`         | Select a service and a Thing, invoke the service, and open the request and response in a temporary JSONC document.          |

### Working with changes

- Open the **Source Control** view and select the **TWLS** repository to see changed service, service-definition, and subscription files. Modified and deleted files are listed with appropriate icons.
- Double-click a change to open a diff against the version currently on the server.
- To push changes, optionally enter a comment in the Source Control input box, then press `Ctrl+Enter` or use **TWLS: Push**. The comment is sent to ThingWorx as the update reason; it is not a Git commit message.
- To discard local edits to a single file, right-click the file and choose **Discard**.
- The status bar shows the active entity; click it to **Switch Entity**.
- To temporarily set aside all modified or deleted files, use **TWLS: Stash Changes**. The working tree is restored to the last-pulled state, allowing you to pull remote updates safely.
- Use **TWLS: Stash List** to choose any saved stash and either apply it or pop it. **Apply** keeps the stash; **Pop** applies it and removes it from the list.
- **TWLS: Stash Apply (Latest)** and **TWLS: Stash Pop (Latest)** provide shortcuts for the newest stash.
- Stashes are stored locally under `.twls/stash/` and persist across VS Code sessions. Applying a stash restores its files on top of the current working tree, so review the resulting Source Control changes before pushing.
- Service source files and their `.yaml` definition sidecars are tracked independently. Review and push both files when changing a service's implementation or signature.

> **Tip:** Pull refuses to run while local changes are present, so push, discard, or stash them first. Push refuses to run when the server has changed since the last pull; pull again before pushing.

### Calling a service on a live Things

Run **TWLS: Call Service** to invoke a service on a live Things. The command:

1. Uses the active repository to list available services.
2. Searches ThingWorx for Things that implement the active Thing Shape or Thing Template.
3. Lets you pick a Thing, or enter its name manually when the search returns no results or cannot be completed.
4. Shows a JSON parameter stub based on the local `.yaml` service definition when one is available.
5. Sends the request to ThingWorx using the repository's configured application key.
6. Opens the request and response in a temporary JSONC editor document.

The result document includes the HTTP status, Thing name, service name, request parameters, and either the parsed JSON response or the raw response body.

Service invocation is a manual execution tool. It does not modify the local service source or automatically push anything to ThingWorx.

### Case-collision handling

ThingWorx can contain artifact names that differ only by letter case. These names can collide when written to a case-insensitive filesystem such as the default Windows filesystem.

When multiple services, subscriptions, or service definitions would resolve to the same case-insensitive filename, TWLS keeps the preferred naming variant and warns about artifacts that were not written. PascalCase is preferred, followed by camelCase, then snake_case and other names.

## Development

```bash
npm install        # install dependencies
npm run compile    # type-check and compile to out/
npm run watch      # recompile on every change
npm run lint       # run ESLint
npm test           # run headless unit tests
npm run test:extension  # run extension tests in a VS Code instance
npm run package    # build the .vsix package
```

`npm test` compiles and lints the source through its `pretest` hook before running the unit tests. Run `npm run compile` separately when you only need to verify compilation.

The extension source is organized into shared core modules and feature-specific modules:

```text
src/
├── core/
│   ├── entity/          # Entity models and ThingWorx payload schemas
│   ├── thingworx/       # ThingWorx API clients and searches
│   └── utilities/       # Shared path and text utilities
├── features/
│   ├── case-collision/  # Case-insensitive artifact collision handling
│   ├── pickers/         # Entity and project QuickPick helpers
│   ├── service-definitions/
│   ├── service-invocation/
│   ├── stash/
│   └── sync/
└── extension.ts         # Extension activation and feature registration
```

The `sync` feature owns repository lifecycle, Source Control integration, working-tree synchronization, remote diff documents, and local artifact storage. Other features register their own commands and use the shared command runner for repository selection, progress reporting, notifications, and error handling.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the release history.
