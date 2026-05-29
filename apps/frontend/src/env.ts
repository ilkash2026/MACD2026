export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080",
  socketUrl: import.meta.env.VITE_SOCKET_URL ?? "http://localhost:8080",
  operatorApiKey: import.meta.env.VITE_OPERATOR_API_KEY ?? "change-me"
};
