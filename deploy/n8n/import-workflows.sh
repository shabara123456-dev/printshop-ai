#!/bin/sh
set -eu

workflow_dir="$(mktemp -d)"
trap 'rm -rf "$workflow_dir"' EXIT HUP INT TERM

node - "$workflow_dir" "${INKORA_API_BASE_URL:-https://printshop-ai.shabara123456.workers.dev}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [directory, baseUrl] = process.argv.slice(2);
const sourceDirectory = '/opt/inkora/workflows';
for (const filename of fs.readdirSync(sourceDirectory).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(fs.readFileSync(path.join(sourceDirectory, filename), 'utf8'));
  const workflows = Array.isArray(parsed) ? parsed : [parsed];
  workflows.forEach((workflow, index) => {
    for (const node of workflow.nodes ?? []) {
      if (typeof node.parameters?.url === 'string') {
        node.parameters.url = node.parameters.url.replaceAll('http://host.docker.internal:3000', baseUrl);
      }
    }
    const output = `${index}-${workflow.id || path.parse(filename).name}.json`;
    fs.writeFileSync(path.join(directory, output), JSON.stringify(workflow));
  });
}
NODE

n8n import:workflow --separate --input="$workflow_dir"
