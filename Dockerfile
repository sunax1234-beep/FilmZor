FROM node:20-slim

# ca-certificates: ffmpeg potrebuje overiť HTTPS certifikáty pri sťahovaní streamu z Webshare.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
# ffmpeg-static/ffprobe-static si pri "npm ci" stiahnu binárky pre AKTUÁLNU
# platformu (linux/amd64) — musí bežať tu v kontajneri, nie skopírované z hosta.
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
