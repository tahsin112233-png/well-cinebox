FROM rust:1.90-slim-bookworm AS builder
WORKDIR /workspace
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential ca-certificates pkg-config \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN CARGO_PROFILE_RELEASE_LTO=false \
    CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 \
    cargo build --release --locked --bin wellcinebox-api

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && useradd --create-home --uid 10001 app \
  && mkdir -p /tmp/wellcinebox-cache /tmp/wellcinebox-data /tmp/wellcinebox-config \
  && chown -R app:app /tmp/wellcinebox-cache /tmp/wellcinebox-data /tmp/wellcinebox-config \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /workspace/target/release/wellcinebox-api /usr/local/bin/wellcinebox-api
ENV PORT=3000 \
    MOVIEBOX_CACHE_DIR=/tmp/wellcinebox-cache \
    MOVIEBOX_DATA_DIR=/tmp/wellcinebox-data \
    MOVIEBOX_CONFIG_DIR=/tmp/wellcinebox-config
EXPOSE 3000
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/wellcinebox-api"]
