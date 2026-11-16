# freelens-tierhighlight

Freelens 2.x extension that draws a colored frame (with a small label) around
the cluster view, chosen by the cluster name or kubeconfig context. Makes it
obvious at a glance whether you are working on prod.

Inspired by `freelens-tierhighlight` (Freelens 1.x, hard-coded names); this is
a rewrite with configurable rules that reacts to cluster switches.

## Install

Download the `.tgz` from the latest
[release](https://github.com/herbeus/freelens-tierhighlight/releases/latest)
and install it on the Freelens Extensions page (path or drag and drop).

## Configuration

Preferences -> Extensions -> Tier Highlight. Rules are comma separated
`pattern=color[:label]`, matched case-insensitively against cluster name and
kubeconfig context; the first match wins. Default:

    prod=#d32f2f, dev=#2e7d32

## Build

    npm install
    npm run build
    npm pack

Install the resulting `.tgz` via the Freelens Extensions page.

## Release

Bump `version` in `package.json`, commit, then push a matching tag
(`git tag v1.0.0 && git push origin v1.0.0`). The release workflow builds
the extension and attaches the `.tgz` to a GitHub release.
