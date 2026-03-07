// create a basic http server using express with socket.io
import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

type RoomId = string;
type SocketId = string;

const roomIdToSockets: Record<RoomId, SocketId[]> = {};

const socketToRoomId: Record<SocketId, RoomId> = {};

io.on("connection", (socket) => {
  console.log("a user connected: " + socket.id);
  socket.on("join room", (roomID) => {
    console.log(`Socket ${socket.id} wants to join room ${roomID}`);
    if (roomIdToSockets[roomID]) {
      const length = roomIdToSockets[roomID].length;
      if (length === 2) {
        socket.emit("room full");
        return;
      }
      roomIdToSockets[roomID].push(socket.id);
    } else {
      roomIdToSockets[roomID] = [socket.id];
    }
    socketToRoomId[socket.id] = roomID;
    const usersInThisRoom = roomIdToSockets[roomID].filter(
      (id) => id !== socket.id,
    );

    socket.emit("all users", usersInThisRoom);
  });

  socket.on("sending signal", (payload) => {
    io.to(payload.userToSignal).emit("user joined", {
      signal: payload.signal,
      callerID: payload.callerID,
    });
  });

  socket.on("returning signal", (payload) => {
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
      } else {
        roomIdToSockets[roomID] = room;
      }
      socket.to(roomID).emit("user left", socket.id);
    }
    delete socketToRoomId[socket.id];
  });
});

server.listen(8000, () => {
  console.log("Server is running on port 8000");
});
