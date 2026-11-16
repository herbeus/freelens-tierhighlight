# freelens-tierhighlight

Freelens 2.x extension that draws a colored frame (with a small label) around
the cluster view, chosen by the cluster name or kubeconfig context, and can
guard changes on matching clusters:

- `confirm`: before a change you have to type the cluster name
  (e.g. `shared-k8s-prod`). Several changes at once (bulk delete) are confirmed
  together.
- `readonly`: changes are blocked.

Guarded are Kubernetes API writes (delete, edit/save, scale, create, cordon via
API), Helm install/upgrade/rollback/uninstall, applying resources from the
editor, and `kubectl`/`helm` commands with a changing verb that are sent to
the terminal as a whole (menu actions like cordon/drain, pasted commands).
Commands typed key by key in the terminal are not inspected.

Inspired by `freelens-tierhighlight` (Freelens 1.x, hard-coded names); this is
a rewrite with configurable rules that reacts to cluster switches.

## Install

Download the `.tgz` from the latest
[release](https://github.com/herbeus/freelens-tierhighlight/releases/latest)
and install it on the Freelens Extensions page (path or drag and drop).

## Configuration

Preferences -> Extensions -> Tier Highlight. Rules are comma separated
`pattern=color[:label[:mode]]` with mode `none` (default), `confirm` or
`readonly`, matched case-insensitively against cluster name and kubeconfig
context; the first match wins. Default:

    prod=#d32f2f:PROD:confirm, dev=#2e7d32

## Build

    npm install
    npm run build
    npm pack

Install the resulting `.tgz` via the Freelens Extensions page.

## Release

Bump `version` in `package.json`, commit, then push a matching tag
(`git tag v1.0.0 && git push origin v1.0.0`). The release workflow builds
the extension and attaches the `.tgz` to a GitHub release.
