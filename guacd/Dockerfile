# guacd with four fixes, built over the official image (which keeps providing the
# runtime, user and entrypoint):
# - libvncclient-screen-id-0.patch is upstream libvncserver commit 041ea57, not
#   in a release yet. Without it, guacd ignores the desktop size QEMU reports,
#   never resizes the guest, and aborts when the guest changes resolution.
# - guacamole-server-jitter-allowance.patch: see the patch header.
# - libvncclient-qemu-clipboard.patch and
#   guacamole-server-extended-clipboard.patch: QEMU clipboard requires UTF-8
#   negotiation and Notify/Request handling, which upstream lacks.
ARG GUACD_VERSION=1.6.0

FROM guacamole/guacd:${GUACD_VERSION} AS build
ARG GUACD_VERSION
USER root
RUN apk add --no-cache autoconf automake build-base cairo-dev cmake git \
        libjpeg-turbo-dev libpng-dev libtool libwebp-dev openssl1.1-compat-dev \
        pulseaudio-dev util-linux-dev zlib-dev
COPY patches /patches

RUN git clone --depth 1 --branch LibVNCServer-0.9.15 \
        https://github.com/LibVNC/libvncserver /src/libvncserver \
    && cd /src/libvncserver \
    && git apply /patches/libvncclient-screen-id-0.patch \
        /patches/libvncclient-qemu-clipboard.patch \
    && cmake -B build \
    && cmake --build build --target vncclient --parallel

RUN git clone --depth 1 --branch ${GUACD_VERSION} \
        https://github.com/apache/guacamole-server /src/guacamole-server \
    && cd /src/guacamole-server \
    && git apply /patches/guacamole-server-jitter-allowance.patch \
        /patches/guacamole-server-extended-clipboard.patch \
    && autoreconf -fi \
    && ./configure --prefix=/opt/guacamole --disable-guacd --disable-guaclog \
        --without-rdp --without-telnet --without-terminal --with-ssh \
        --with-pulse --with-vnc CPPFLAGS=-I/opt/guacamole/include \
        LDFLAGS=-L/opt/guacamole/lib \
    && make -j"$(nproc)"

FROM guacamole/guacd:${GUACD_VERSION}
COPY --from=build /src/libvncserver/build/libvncclient.so.0.9.15 /opt/guacamole/lib/
COPY --from=build /src/guacamole-server/src/libguac/.libs/libguac.so.25.0.0 /opt/guacamole/lib/
COPY --from=build /src/guacamole-server/src/protocols/vnc/.libs/libguac-client-vnc.so.0.0.0 /opt/guacamole/lib/
