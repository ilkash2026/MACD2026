FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build -w @inner-circle/contracts
RUN npm run prisma:generate -w @inner-circle/backend
RUN npm run build -w @inner-circle/backend

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build /app/package.json ./package.json
EXPOSE 8080
CMD ["node", "apps/backend/dist/server.js"]
