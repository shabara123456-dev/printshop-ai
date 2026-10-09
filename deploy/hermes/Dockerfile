FROM nousresearch/hermes-agent:latest

COPY --chmod=0755 init-config.sh /etc/cont-init.d/03-inkora-config

# Keep the upstream entrypoint. It runs Hermes' s6 setup and then dispatches
# these arguments to the Hermes CLI as the non-root hermes user.
CMD ["gateway", "run", "--no-supervise", "-v"]
