FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    wget \
    libguestfs-tools \
    qemu-utils \
    linux-image-amd64 \
    sudo

ENV LIBGUESTFS_BACKEND=direct

RUN mkdir -p /var/lib/distribox/images/

ARG IMAGE

COPY $IMAGE /usr/local/bin/build_script.sh
COPY scripts/*.metadata.yaml /usr/local/bin/
RUN chmod +x /usr/local/bin/build_script.sh

ENTRYPOINT ["/usr/local/bin/build_script.sh"]
