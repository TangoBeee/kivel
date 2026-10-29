# Client releases

Include a changeset with published SDK or CLI changes:

```sh
pnpm changeset
```

Select the affected public package and patch, minor or major. Write a short note
about user-visible behavior. SDK changes also update the CLI when its exact SDK
dependency changes. CLI-only changes do not release the SDK. Private app packages
are never published.

Push to main creates or updates the automated release PR. Merge that PR to publish
the reviewed versions and changelogs under the beta tag. Branch pushes and PRs do
not publish. See docs/client-releases.md for trusted-publisher setup and recovery.
