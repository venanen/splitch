FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/types/package.json packages/types/package.json
COPY packages/calc/package.json packages/calc/package.json
COPY apps/web/package.json apps/web/package.json

RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY packages/types packages/types
COPY packages/calc packages/calc
COPY apps/web apps/web

WORKDIR /app/apps/web
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
