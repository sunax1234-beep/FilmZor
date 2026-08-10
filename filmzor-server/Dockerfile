FROM node:20-slim

# ffmpeg: nainštalovaný cez apt (nie balík ffmpeg-static) — jeho zabalená
# statická binárka spoľahlivo padala so SIGSEGV pri akomkoľvek HTTP vstupe
# v tomto kontajneri/hostiteľovi, apt verzia je zlinkovaná priamo pre toto
# prostredie. ca-certificates: ffmpeg potrebuje overiť HTTPS certifikáty
# pri sťahovaní streamu z Webshare.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
