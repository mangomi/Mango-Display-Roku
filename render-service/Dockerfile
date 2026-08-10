# Render service image.
#
# Built for arm64 (Graviton / Fargate ARM): the workload is Chromium and
# sharp, both of which are cheaper per render there, and it is the same
# architecture we would move to on EC2 spot later.
#
# Playwright's own base image is used rather than installing Chromium by
# hand - it pins a browser build known to match the client library, which
# is exactly the pairing that breaks silently when they drift apart.
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

# The portal renders with these; without them every capture falls back to
# a substitute face and every text measurement in the manifest is wrong.
COPY fonts/ /usr/local/share/fonts/mangodisplay/
RUN fc-cache -f

# dependencies first so a code change does not re-install them
COPY render-service/package*.json ./
RUN npm ci --omit=dev

COPY render-service/ ./

# where images and manifests are written before publishing
RUN mkdir -p /app/out
ENV OUT_DIR=/app/out

# the long-poll/interact endpoint the displays talk to
EXPOSE 8091

# No CMD default for the display: this image must be told which display it
# serves. Starting with no configuration would render the development
# display, which is worse than failing.
CMD ["node", "watch.js"]
