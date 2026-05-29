FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build -w @inner-circle/contracts
RUN npm run build -w @inner-circle/frontend

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g serve
COPY --from=build /app/apps/frontend/dist ./dist
EXPOSE 4173
CMD ["serve", "-s", "dist", "-l", "4173"]
