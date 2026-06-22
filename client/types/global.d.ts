export {};

declare global {
  interface TextMessage {
    id: string;
    text: string;
    timestamp: string;
    fromSelf: boolean;
  }
}
