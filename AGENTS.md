# Delphi SDK working rules

This is an independent, published SDK repository, sometimes checked out as the
platform submodule `packages/telphi-sdk`. Its commits, branches, PRs, dependency
lockfile, and quality gate belong to this repository.

- Inspect `git status --short --branch` and untracked files before working.
  Preserve existing work. A parent-platform commit or push does not save SDK files.
- Work on a feature branch here; do not develop on a detached submodule HEAD.
- Use Node 24 and the package manager pinned in package.json. Validate the SDK
  standalone, outside the platform workspace, as well as its platform integration.
  The platform's overrides and passing audit do not validate this lockfile.
- For code or dependency changes, run frozen installation, lint, type-check,
  `pnpm test:coverage`, SDK build, React example build, and `pnpm audit`.
- Keep the core free of runtime dependencies. Prefer supported patch/minor fixes;
  assess major upgrades separately. Do not suppress advisories to make CI pass.
- SDK Sonar analysis is owned here; platform Sonar excludes the SDK. Keep LCOV
  reporting and the required SDK checks/Sonar gate enabled. Do not bypass or
  weaken gates to land changes. Test doubles should be type-correct without
  disabling lint or TypeScript rules.
- Merge the SDK PR before updating the platform's gitlink to the merged commit.
  Link the SDK PR from the platform pointer-update PR, and verify that the pinned
  commit is reachable on the SDK remote and integration checks pass.
- Do not publish an npm release merely to update the platform submodule. Publishing
  requires a release request and an appropriate version/changelog change.
- Respect the user's existing authorization for commits, PRs, merges, and fixes;
  these rules do not introduce additional approval steps.
