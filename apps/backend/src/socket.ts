import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import type { WsEventMap } from "@inner-circle/contracts";

export type AppSocket = Server;

let io: AppSocket;

export function initSocket(server: HttpServer): AppSocket {
  io = new Server(server, {
    cors: { origin: "*" },
    transports: ["websocket", "polling"]
  });
  return io;
}

export function emitEvent<K extends keyof WsEventMap>(event: K, payload: WsEventMap[K]): void {
  if (!io) return;
  io.emit(event, payload);
}
