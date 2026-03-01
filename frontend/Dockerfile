FROM node:24-alpine as base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate
COPY ./package.json ./pnpm-lock.yaml /app/
RUN pnpm install --frozen-lockfile

FROM base as dev-stage
CMD pnpm dev --host --port $VITE_PORT

FROM base as production-stage
COPY . /app
RUN pnpm build
ENV PORT="3000"
ENV NODE_ENV="production"
CMD pnpm start --host --port $VITE_PORT
