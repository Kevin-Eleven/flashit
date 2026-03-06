export {};

declare global {
  interface UploadedFile {
    id: string;
    name: string;
    size: string;
  }

  interface TextMessage {
    id: string;
    text: string;
    timestamp: string;
    fromSelf: boolean;
  }

  interface Window {
    peer: SimplePeer.Instance | null;
  }
  type roomId = string;
  type users = string[];
}
