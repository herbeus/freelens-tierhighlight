# freelens-tierhighlight

Freelens 2.x extension that draws a colored frame (with a small label) around
the cluster view, chosen by the cluster name or kubeconfig context. Makes it
obvious at a glance whether you are working on prod.

Inspired by `freelens-tierhighlight` (Freelens 1.x, hard-coded names); this is
a rewrite with configurable rules that reacts to cluster switches.

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
