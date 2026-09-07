# Change Log

All notable changes to the "twls" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.2] - 2026-09-07

### Fixed

- Switch Entity command now works when invoked without an active repository; it falls back to picking a repository
- Push uses the server timestamp after a successful push, avoiding false "ThingWorx changed since last pull" conflicts

### Changed

- Extension manifest now uses the "ThingWorx Local Service" display name and publisher metadata

## [0.0.1] - 2026-02-11

### Added

- Initialize, Pull, Pull Project, Push, Switch Entity, and Discard commands
