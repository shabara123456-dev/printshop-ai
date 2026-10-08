FROM docker.n8n.io/n8nio/n8n:2.42.5

COPY --chmod=0755 deploy/n8n/start.sh /opt/inkora/start.sh
COPY --chmod=0755 deploy/n8n/import-workflows.sh /opt/inkora/import-workflows.sh
COPY n8n/workflows /opt/inkora/workflows

ENTRYPOINT ["/bin/sh", "/opt/inkora/start.sh"]
