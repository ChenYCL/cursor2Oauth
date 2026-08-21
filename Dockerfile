FROM node:20-slim

RUN apt-get update && apt-get install -y curl sqlite3 ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*

RUN curl https://cursor.com/install -fsS | bash

ENV PATH="/root/.local/bin:${PATH}"

RUN agent --version \
  && if [ ! -e /root/.local/bin/cursor-agent ]; then ln -sf /root/.local/bin/agent /root/.local/bin/cursor-agent; fi \
  && cursor-agent --version

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY server.js docker-entrypoint.sh ./
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8010

ENV PORT=8010
ENV HOST=0.0.0.0

ENTRYPOINT ["/app/docker-entrypoint.sh"]
