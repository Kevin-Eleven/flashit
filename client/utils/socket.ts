// This is exactly what we discussed — module-level variable
// Both send and receive pages import the same socket instance
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io("http://localhost:8000");
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
