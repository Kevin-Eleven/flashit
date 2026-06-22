import type Peer from "simple-peer";

// ── Socket.IO signaling payloads (client ↔ server) ──

export interface SendingSignalPayload {
  userToSignal: string;
  callerID: string;
  signal: Peer.SignalData;
}

export interface UserJoinedPayload {
  signal: Peer.SignalData;
  callerID: string;
}

export interface ReturningSignalPayload {
  signal: Peer.SignalData;
  callerID: string;
}

export interface ReceivingReturnedSignalPayload {
  signal: Peer.SignalData;
  id: string;
}

// ── Peer-to-peer data-channel messages (browser ↔ browser) ──
// Binary chunks are raw file data; these are the JSON control/text frames.

export type DataMessage =
  | { type: "text"; text: string }
  | { done: true; fileName: string };
