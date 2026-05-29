FROM node:20-alpine AS build
WORKDIR /app
COPY . .
ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_SOCKET_URL=http://localhost:8080
ARG VITE_OPERATOR_API_KEY=change-me
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}
ENV VITE_OPERATOR_API_KEY=${VITE_OPERATOR_API_KEY}
RUN npm install
RUN npm run build -w @inner-circle/contracts
RUN npm run build -w @inner-circle/frontend

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g serve
COPY --from=build /app/apps/frontend/dist ./dist
EXPOSE 8080
CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
