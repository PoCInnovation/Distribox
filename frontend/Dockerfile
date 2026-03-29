FROM node:24-alpine as base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate
COPY ./package.json ./pnpm-lock.yaml /app/
RUN pnpm install --frozen-lockfile

FROM base as dev-stage
CMD pnpm dev --host --port $VITE_PORT

FROM base as production-stage
ARG VITE_API_DOMAIN=http://localhost:8080
ARG VITE_PORT=3000
ARG VITE_FRONTEND_URL=http://localhost:3000
ENV VITE_API_DOMAIN=$VITE_API_DOMAIN
ENV VITE_PORT=$VITE_PORT
ENV VITE_FRONTEND_URL=$VITE_FRONTEND_URL
COPY . /app
RUN pnpm build
ENV PORT="3000"
ENV NODE_ENV="production"
CMD pnpm start --host --port $VITE_PORT
