import express from "express";
import http from "http";
import { Server } from "socket.io";

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:3000";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST"],
  },
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    rooms: Object.keys(roomIdToSockets).length,
    connections: io.engine.clientsCount,
  });
});

type RoomId = string;
type SocketId = string;

const roomIdToSockets: Record<RoomId, SocketId[]> = {};
const socketToRoomId: Record<SocketId, RoomId> = {};
const roomCreatedAt: Record<RoomId, number> = {};

// Rate limiter: track message counts per socket
const socketMsgCount: Record<SocketId, { count: number; resetAt: number }> = {};
const RATE_LIMIT_POINTS = 30;
const RATE_LIMIT_WINDOW_MS = 1000;

function isRateLimited(socketId: SocketId): boolean {
  const now = Date.now();
  const entry = socketMsgCount[socketId];
  if (!entry || now > entry.resetAt) {
    socketMsgCount[socketId] = {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_POINTS;
}

// Sweep zombie rooms older than 1 hour
setInterval(() => {
  const now = Date.now();
  for (const roomId of Object.keys(roomCreatedAt)) {
    if (now - roomCreatedAt[roomId] > 3600000) {
      const sockets = roomIdToSockets[roomId];
      if (sockets) {
        for (const sid of sockets) {
          delete socketToRoomId[sid];
        }
      }
      delete roomIdToSockets[roomId];
      delete roomCreatedAt[roomId];
    }
  }
}, 60000);

io.on("connection", (socket) => {
  // Per-socket rate limiting middleware
  socket.use(([event, ...args], next) => {
    if (isRateLimited(socket.id)) {
      next(new Error("Rate limit exceeded"));
      return;
    }
    next();
  });

  socket.on("join room", (roomID) => {
    if (typeof roomID !== "string" || roomID.length < 1 || roomID.length > 64)
      return;
    if (roomIdToSockets[roomID]) {
      const length = roomIdToSockets[roomID].length;
      if (length === 2) {
        socket.emit("room full");
        return;
      }
      roomIdToSockets[roomID].push(socket.id);
    } else {
      roomIdToSockets[roomID] = [socket.id];
      roomCreatedAt[roomID] = Date.now();
    }
    socketToRoomId[socket.id] = roomID;
    const usersInThisRoom = roomIdToSockets[roomID].filter(
      (id) => id !== socket.id,
    );

    socket.emit("all users", usersInThisRoom);
  });

  socket.on("sending signal", (payload) => {
    if (!payload || typeof payload.userToSignal !== "string" || !payload.signal)
      return;
    // Enforce same-room: target must be in the sender's room
    const roomID = socketToRoomId[socket.id];
    if (!roomID || !roomIdToSockets[roomID]?.includes(payload.userToSignal))
      return;
    // Reject oversized signals
    if (JSON.stringify(payload.signal).length > 65536) return;

    io.to(payload.userToSignal).emit("user joined", {
      signal: payload.signal,
      callerID: socket.id, // use verified server-side ID
    });
  });

  socket.on("returning signal", (payload) => {
    if (!payload || typeof payload.callerID !== "string" || !payload.signal)
      return;
    // Enforce same-room
    const roomID = socketToRoomId[socket.id];
    if (!roomID || !roomIdToSockets[roomID]?.includes(payload.callerID)) return;
    if (JSON.stringify(payload.signal).length > 65536) return;

    io.to(payload.callerID).emit("receiving returned signal", {
      signal: payload.signal,
      id: socket.id,
    });
  });

  socket.on("disconnect", () => {
    const roomID = socketToRoomId[socket.id];
    let room = roomIdToSockets[roomID];
    if (room) {
      room = room.filter((id) => id !== socket.id);
      if (room.length === 0) {
        delete roomIdToSockets[roomID];
        delete roomCreatedAt[roomID];
      } else {
        roomIdToSockets[roomID] = room;
      }
      socket.to(roomID).emit("user left", socket.id);
    }
    delete socketToRoomId[socket.id];
    delete socketMsgCount[socket.id];
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown
function shutdown() {
  console.log("Shutting down gracefully...");
  io.emit("server-shutdown");
  io.close(() => {
    server.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
