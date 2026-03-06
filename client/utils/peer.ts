import Peer, { SimplePeer } from "simple-peer";

// Private to this module — nobody outside can touch this directly
let peer: any = null;

export function createPeer(initiator: boolean): any {
  if (peer) peer.destroy();
  peer = new Peer({ initiator, trickle: false });
  return peer;
}

export function getPeer(): any {
  return peer;
}

export function destroyPeer() {
  if (peer) {
    peer.destroy();
    peer = null;
  }
}
