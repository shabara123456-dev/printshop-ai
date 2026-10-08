FROM docker.n8n.io/n8nio/n8n:2.42.5

COPY deploy/n8n/start.sh /opt/inkora/start.sh
COPY n8n/workflows /opt/inkora/workflows

ENTRYPOINT ["/bin/sh", "/opt/inkora/start.sh"]
