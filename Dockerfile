FROM node:20-slim

RUN apt-get update && apt-get install -y curl sqlite3 ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*

RUN curl https://cursor.com/install -fsS | bash

ENV PATH="/root/.local/bin:${PATH}"

RUN agent --version

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --production

COPY server.js ./

EXPOSE 8010

ENV PORT=8010
ENV HOST=0.0.0.0

CMD ["node", "server.js"]