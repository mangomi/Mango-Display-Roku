# Render service image.
#
# Built for arm64 (Fargate ARM / Graviton): the workload is Chromium and
# sharp, both cheaper per render there, and it is the architecture we
# would move to on EC2 spot later.
#
# The browser is installed by the SAME Playwright that will drive it,
# rather than inheriting a pinned playwright:vX base image. Those base
# images ship a browser matched to one library version, and this project
# has already drifted once (code on 1.61, Dockerfile pinned to 1.47) -
# which fails at runtime, not at build, where it is far more annoying to
# diagnose.
# Amazon's mirror of the official image, not Docker Hub directly: builds
# run from shared AWS addresses, and anonymous Docker Hub pulls get
# rate-limited (429) from there. Same image, no credentials needed.
FROM public.ecr.aws/docker/library/node:20-bookworm-slim

WORKDIR /app

# dependencies first so a code change does not reinstall them
COPY render-service/package*.json ./
RUN npm ci --omit=dev

# Chromium plus its system libraries, chosen by the installed Playwright.
# --with-deps also brings fontconfig, which the font cache below needs.
RUN npx playwright install --with-deps chromium && \
    rm -rf /var/lib/apt/lists/*

# The portal renders with these. Without them every capture falls back to
# a substitute face and every text measurement in the manifest is wrong -
# silently, since nothing errors.
COPY fonts/ /usr/local/share/fonts/mangodisplay/
RUN fc-cache -f

COPY render-service/ ./

# rendered output before it is published to R2
RUN mkdir -p /app/out

# the long-poll / interact endpoint the displays talk to
EXPOSE 8091

# The fleet manager. Displays announce themselves with identity on every
# control request; DISPLAY_* environment variables optionally pin one
# legacy display for channels that predate identity.
CMD ["node", "fleet.js"]
