FROM nousresearch/hermes-agent:latest

COPY --chmod=0755 init-config.sh /etc/cont-init.d/03-inkora-config

# Keep the upstream entrypoint. It runs Hermes' s6 setup and then dispatches
# the start script as the non-root hermes user.
COPY --chmod=0755 start-hermes.sh /usr/local/bin/inkora-hermes-start
CMD ["/usr/local/bin/inkora-hermes-start"]
