import Peer from "simple-peer";

let peer: Peer.Instance | null = null;

export function createPeer(initiator: boolean): Peer.Instance {
  if (peer) peer.destroy();

  const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

  if (process.env.NEXT_PUBLIC_TURN_URL) {
    iceServers.push({
      urls: process.env.NEXT_PUBLIC_TURN_URL,
      username: process.env.NEXT_PUBLIC_TURN_USER || "",
      credential: process.env.NEXT_PUBLIC_TURN_CRED || "",
    });
  }

  peer = new Peer({
    initiator,
    trickle: false,
    config: { iceServers },
  });
  return peer;
}

export function getPeer(): Peer.Instance | null {
  return peer;
}

export function destroyPeer() {
  if (peer) {
    peer.destroy();
    peer = null;
  }
}
