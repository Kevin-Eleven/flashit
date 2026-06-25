"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import type Peer from "simple-peer";
import { getSocket, disconnectSocket } from "@/utils/socket";
import { createPeer, getPeer, destroyPeer } from "@/utils/peer";
import type {
  UserJoinedPayload,
  ReceivingReturnedSignalPayload,
  SendingSignalPayload,
  ReturningSignalPayload,
} from "@/types/signaling";

export type ConnectionStatus =
  | "waiting"
  | "connecting"
  | "connected"
  | "disconnected";

// Owns the Socket.IO signaling exchange and the WebRTC peer lifecycle for a
// /share/[roomId] session. Whoever lands on the room first waits
// (non-initiator); the second arrival initiates the handshake.
export function useRoomConnection(
  roomId: string,
  onPeerReady: (peer: Peer.Instance, worker: Worker) => void,
) {
  const router = useRouter();
  const workerRef = useRef<Worker | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("waiting");

  function handlePeerError() {
    setConnectionStatus("disconnected");
    destroyPeer();
  }

  function handlePeerClose() {
    setConnectionStatus("disconnected");
    destroyPeer();
  }

  function wirePeer(peer: Peer.Instance, worker: Worker) {
    peer.on("connect", () => setConnectionStatus("connected"));
    peer.on("error", () => handlePeerError());
    peer.on("close", () => handlePeerClose());
    onPeerReady(peer, worker);
  }

  useEffect(() => {
    const worker = new Worker("/worker.js");
    workerRef.current = worker;

    const socket = getSocket();

    // We initiate when we join a room that already has someone in it.
    const onAllUsers = (users: string[]) => {
      if (users.length === 0) {
        setConnectionStatus("waiting");
        return;
      }
      setConnectionStatus("connecting");
      const peer = createPeer(true);
      peer.on("signal", (signal) => {
        const payload: SendingSignalPayload = {
          userToSignal: users[0],
          callerID: socket.id ?? "",
          signal,
        };
        socket.emit("sending signal", payload);
      });
      wirePeer(peer, worker);
    };

    // We answer when someone joins after us.
    const onUserJoined = (payload: UserJoinedPayload) => {
      setConnectionStatus("connecting");
      const peer = createPeer(false);
      peer.on("signal", (signal) => {
        const reply: ReturningSignalPayload = {
          signal,
          callerID: payload.callerID,
        };
        socket.emit("returning signal", reply);
      });
      wirePeer(peer, worker);
      peer.signal(payload.signal);
    };

    const onReturnedSignal = (payload: ReceivingReturnedSignalPayload) => {
      getPeer()?.signal(payload.signal);
    };

    const onRoomFull = () => {
      toast.error("Room is full");
      router.push("/");
    };

    const onUserLeft = () => handlePeerClose();
    const onDisconnect = () => setConnectionStatus("disconnected");

    socket.on("all users", onAllUsers);
    socket.on("user joined", onUserJoined);
    socket.on("receiving returned signal", onReturnedSignal);
    socket.on("room full", onRoomFull);
    socket.on("user left", onUserLeft);
    socket.on("disconnect", onDisconnect);

    socket.emit("join room", roomId);

    return () => {
      socket.off("all users", onAllUsers);
      socket.off("user joined", onUserJoined);
      socket.off("receiving returned signal", onReturnedSignal);
      socket.off("room full", onRoomFull);
      socket.off("user left", onUserLeft);
      socket.off("disconnect", onDisconnect);
      worker.terminate();
      disconnectSocket();
      destroyPeer();
    };
    // Connection setup runs once on mount; roomId is fixed per page instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connectionStatus, workerRef };
}
