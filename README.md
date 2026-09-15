# ThingWorx Local Service (TWLS)

Edit ThingWorx service and subscription code (JavaScript and SQL) as plain local files in VS Code, then sync it back and forth with a ThingWorx server.

TWLS turns a workspace folder into a working copy of a ThingWorx **entity** — a Thing Shape or Thing Template. Its services and subscriptions are pulled down into real local files (services use `.js` or `.sql`, while subscriptions use `.js`), where you can use your normal editor tooling, see exactly what changed in the Source Control view, and push those changes back to ThingWorx.

## Features

- **Two-way sync with ThingWorx** — pull services and subscriptions down to disk, edit locally, push them back up to the server.
- **Source Control integration** — modified and deleted services and subscriptions appear as changes in a dedicated _TWLS_ panel, complete with an inline diff against the remote version.
- **File-level granularity** — each service maps to a single `.js` (script) or `.sql` (query) file, while each subscription maps to a single `.js` file, and each file is tracked independently.
- **Project support** — pull not just one entity, but every entity that belongs to a ThingWorx project.
- **Stash support** — temporarily save local changes so you can pull remote updates without losing your work, then apply or pop those changes later.
- **Conflict protection** — refuses to push if ThingWorx has changed since your last pull, so you never silently overwrite someone else's work.
- **Clean diffs** — dirty detection normalizes line endings, so CRLF/LF differences alone don't mark a file as modified.

## How it works

1. A workspace folder is configured by creating a `.twls/thingworx.json` file that points at a ThingWorx server:

   ```json
   {
     "baseUrl": "http://localhost:8080",
     "appKey": "xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx",
     "entityName": "MyThingShape"
   }
   ```

   `entityName` is the **active entity** the folder is currently bound to.

2. Services and subscriptions of that entity are written to disk under a path that mirrors ThingWorx's project structure. Services are stored in `services/`, while subscriptions are stored in `subscriptions/`.

   ```
   <workspaceFolder>/
   ├── .twls/
   │   └── thingworx.json
   └── <projectName>/
      └── <entityName>/
         ├── services/
         │  ├── MyScriptService.js
         │  └── MyQueryService.sql
         └── subscriptions/
            └── MyScriptSubscription.js
      └── <anotherEntityName>/
         ├── services/
         └── subscriptions/
   ```

   When using **TWLS: Pull Project**, additional entity directories are created under the same project directory. Each entity has its own `services/` and `subscriptions/` folders.

3. TWLS compares the on-disk files against the last-known remote state and shows any differences in the Source Control view. The remote side of a diff is served as a read-only virtual document, so you always compare against the actual server content.

## Requirements

- VS Code 1.108.1 or newer
- A ThingWorx instance reachable over HTTP(S) from your machine
- A ThingWorx **Application Key** that is allowed to read and update the entities/projects you want to work with

## Installation

TWLS is not published to the VS Code Marketplace yet, so install it from a VSIX. The maintainer publishes a `.vsix` for each release to the [repository releases page](http://192.168.7.101/team-project-3-reborn/twls/-/releases). Alternatively, build one from source:

```bash
npm install
npm run package   # produces twls-<version>.vsix
```

Then in VS Code open the **Extensions** view (`Ctrl+Shift+X`), click the `...` menu, choose **Install from VSIX...**, and select the downloaded or generated `.vsix` file.

## Usage

### Getting started

Run the **TWLS: Initialize** command and follow the prompts:

1. Pick the workspace folder you want to use.
2. Enter your ThingWorx Base URL (e.g. `http://localhost:8080`).
3. Enter your Application Key.
4. Pick a project. If the project has no entities, pick an entity manually.

TWLS writes the `.twls/thingworx.json` config, pulls the entity's services and subscriptions into the folder, and they're ready to edit.

### Commands

All commands live in the command palette (`Ctrl+Shift+P`) under the **TWLS** category.

| Command               | Description                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `TWLS: Initialize`    | Set up a workspace folder as a TWLS repository (see above).                                                                 |
| `TWLS: Pull`          | Download the active entity's services and subscriptions, overwriting local files. No-op when nothing changed on the server. |
| `TWLS: Pull Project`  | Download the services and subscriptions of every entity in a project you pick.                                              |
| `TWLS: Push`          | Upload all changed local service and subscriptions files to ThingWorx.                                                      |
| `TWLS: Switch Entity` | Point the folder at a different entity and pull its services and subscriptions in.                                          |
| `TWLS: Discard`       | Revert a single changed file back to its remote version.                                                                    |
| `TWLS: Stash Changes` | Save all modified and deleted files in a persistent stash, then restore the working tree to its last-pulled state.          |
| `TWLS: Stash List`    | List saved stashes and choose a stash to apply or pop.                                                                      |
| `TWLS: Stash Apply (Latest)` | Apply the latest stash without removing it from the stash list.                                                        |
| `TWLS: Stash Pop (Latest)`   | Apply the latest stash and remove it from the stash list.                                                               |

### Working with changes

- Open the **Source Control** view and select the **TWLS** repository to see which services and subscriptions changed. Modified and deleted files are listed with appropriate icons.
- Double-click a change to open a diff against the version currently on the server.
- To push, optionally enter a comment in the Source Control input box, then press `Ctrl+Enter` (or use **TWLS: Push**). The comment is sent to ThingWorx as the update reason; it is not a Git commit message.
- To throw away local edits to one file, right-click it and choose **Discard**.
- The status bar shows the active entity; click it to **Switch Entity**.
- To temporarily set aside all modified or deleted files, use **TWLS: Stash Changes**. The working tree is restored to the last-pulled state, allowing you to pull remote updates safely.
- Use **TWLS: Stash List** to choose any saved stash and either apply it or pop it. **Apply** keeps the stash; **Pop** applies it and removes it from the list.
- **TWLS: Stash Apply (Latest)** and **TWLS: Stash Pop (Latest)** provide shortcuts for the newest stash.
- Stashes are stored locally under `.twls/stash/` and persist across VS Code sessions. Applying a stash restores its files on top of the current working tree, so review the resulting Source Control changes before pushing.

> **Tip:** Pull refuses to run while there are uncommitted local changes — push, discard, or stash them first. Push refuses to run if the server moved ahead of your last pull — pull again to get the latest.

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

The unit tests run against the compiled output, so run `npm run compile` before `npm test` if you changed the source.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the release history.
