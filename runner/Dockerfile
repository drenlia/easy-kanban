FROM node:22-alpine

RUN apk add --no-cache git openssh-client

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

RUN mkdir -p /tmp/jobs

ENV PORT=8080
ENV MAX_CONCURRENT=1
EXPOSE 8080

CMD ["node", "src/index.js"]
