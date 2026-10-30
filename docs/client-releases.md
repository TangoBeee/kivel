# SDK and CLI releases

Public packages: `@socket-help/sdk` and `@socket-help/cli`. The current distribution
channel is `beta`; neither private app packages nor the internal tool engine are
published. SDK and CLI versions are independent. CLI's `workspace:*` dependency
packs as an exact SDK version, so an SDK update also gets a CLI dependency release.

## Normal flow

1. Change SDK or CLI code and run `pnpm changeset`. Select the affected package,
   patch/minor/major, and a short user-facing description. Test-only changes need
   no release note; shipped READMEs, metadata and runtime code do.
2. Push/merge to main. The Client releases workflow creates or updates one release
   PR with versions, changelogs and lockfile changes. Feature branches never publish.
3. Review and merge the release PR. GitHub builds and tests standalone tarballs,
   then publishes only the Changesets plan's packages using npm OIDC, SDK before
   CLI. The exact tested tarballs are passed between jobs with checksums.
4. GitHub package tags and prerelease notes are recorded after npm succeeds.
   Package versions are immutable. A partial failure can be retried; already
   published packages do not get a new version merely because the job retries.

CI rejects published client changes without a changeset, including direct main
pushes. Private packages do not change version. A CLI-only change leaves the SDK
alone. No dependency is silently bundled and no long-lived NPM_TOKEN is needed.

```sh
pnpm test:releases  # isolated version/dependency/changelog and coverage cases
pnpm test:packages  # pack, audit, offline install, TypeScript and CLI checks
```

Tarballs and the checksum manifest are in ignored `release/`. After a completed
release, `pnpm test:packages --published` verifies registry tags, download integrity
and every packaged file against the local build, then installs from npm. File
comparison allows compression differences between Node versions while rejecting
unreleased source changes. CI still publishes the exact tested archive bytes.

## One-time GitHub/npm setup

For both packages, trust GitHub owner `TangoBeee`, repository `socket.help`, workflow
`publish-clients.yaml`, environment `npm`, with direct publishing allowed. The
GitHub `npm` environment must allow main. Do not add environment reviewers if you
want publishing to proceed automatically after merging the reviewed release PR.
Enable Actions permission to create PRs in repository Actions settings.

The release workflow has separate read-only planning/testing, PR-writing,
OIDC-publishing and tag-writing jobs. The pinned Changesets and artifact actions
use Node 24. The repository can remain private; do not force public provenance
while it is private. Never copy an npm token into a workflow or chat.

GitHub does not start ordinary push/PR workflows for PRs created using its default
GITHUB_TOKEN. The generated versions are tested before the bot commits them and
again after merge before publishing. If branch protection requires the regular CI
check on the bot PR, manually dispatch CI against that branch, or configure a
GitHub App token for the version action so normal PR events trigger. Do not remove
branch protection to work around this.

## Recovery and channel changes

Use the workflow's Run workflow button on main to retry an interrupted run. Do not
change version numbers or edit a published package to recover a failed upload.
The plan prevents publishing unaffected packages and avoids moving npm tags
backward. Run `pnpm release:version` only on a clean release branch when debugging;
it consumes changesets and edits manifests/changelogs.

For a manual emergency release of already-tested tarballs:

```sh
npm login --registry=https://registry.npmjs.org
pnpm test:packages
node scripts/publish-clients.mjs --publish beta
```

The npm package READMEs cover installation. `@beta` selects the current test
channel; npm also assigned latest on the initial 0.3.0 publication. Stable
promotion remains deliberate: change the workflow tag and package publishConfig
settings together after beta acceptance, and verify dist-tags in npm.

References: [Changesets automation](https://changesets.dev/guide/automating),
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
