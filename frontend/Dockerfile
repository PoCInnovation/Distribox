FROM node:24-alpine
COPY . /app
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate
COPY ./package.json ./pnpm-lock.yaml /app/
WORKDIR /app
RUN pnpm install --frozen-lockfile

RUN pnpm build

ENV PORT="3000"
ENV NODE_ENV="production"

WORKDIR /app

CMD ["pnpm", "start"]
