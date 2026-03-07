# FlashIt

Simple, instant peer-to-peer file and text sharing in the browser. No uploads to any server — files travel directly between devices over WebRTC data channels.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
  - [High-Level Flow](#high-level-flow)
  - [Client (Next.js)](#client-nextjs)
  - [Signaling Server (Express + Socket.IO)](#signaling-server-express--socketio)
  - [WebRTC Peer Connection](#webrtc-peer-connection)
  - [File Transfer Protocol](#file-transfer-protocol)
  - [Web Worker](#web-worker)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Install Dependencies](#install-dependencies)
  - [Environment Variables](#environment-variables)
  - [Run in Development](#run-in-development)
- [Production Build](#production-build)
- [Contributing](#contributing)

---

## Overview

FlashIt lets two users share files and text messages in real time through a direct browser-to-browser connection. The sender creates a room and gets a 6-character code (or shareable link). The receiver enters that code or opens the link. Once both sides are in the same room, a WebRTC data channel is established and all data flows peer-to-peer — the server is only used for signaling (exchanging SDP offers/answers to set up the connection).

Key properties:

- **Peer-to-peer** — files never touch the server; they stream directly between browsers.
- **Ephemeral** — rooms are auto-cleaned after 1 hour, no data is stored.
- **Real-time messaging** — text chat over the same data channel alongside file transfers.
- **Dark / light theme** — persisted in `localStorage`.
- **Up to 1 GB per file** — chunked transfer with back-pressure handling.

---

## Architecture

### High-Level Flow

```
┌──────────┐         Socket.IO          ┌──────────────┐         Socket.IO          ┌──────────┐
│  Sender  │ ◄──── signaling only ────► │   Server     │ ◄──── signaling only ────► │ Receiver │
│ (browser)│                            │ (Express +   │                            │ (browser)│
│          │                            │  Socket.IO)  │                            │          │
│          │ ◄═══ WebRTC data channel ══════════════════════════════════════════════►│          │
│          │        files + text                                                    │          │
└──────────┘       (peer-to-peer)                                                   └──────────┘
```

1. **Sender** opens `/send`, which generates a random 6-char room ID and joins the room via Socket.IO.
2. **Receiver** enters the code on `/receive` (or opens the `/share/<roomId>` link directly).
3. The server relays WebRTC SDP offers and answers between the two sockets (signaling).
4. Once the WebRTC handshake completes, a direct data channel opens between the browsers.
5. Files and text messages flow over that data channel — the server is no longer involved.

---

### Client (Next.js)

The client is a Next.js 16 app located in the `client/` directory. It uses the App Router (`app/` directory).

#### Pages

| Route             | File                          | Purpose                                                                                                                                |
| ----------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/`               | `app/page.tsx`                | Landing page with "Send Files" and "Receive Files" buttons.                                                                            |
| `/send`           | `app/send/page.tsx`           | Creates a room, displays the 6-char code and a shareable link, waits for a peer to join. Navigates to `/share/<roomId>` on connection. |
| `/receive`        | `app/receive/page.tsx`        | Text input for the 6-char code. Joins the room and navigates to `/share/<roomId>` on connection.                                       |
| `/share/[roomId]` | `app/share/[roomId]/page.tsx` | Server component that extracts the dynamic `roomId` param and renders `<ShareClient>`.                                                 |

#### Key Components

- **`ShareClient`** (`components/ShareClient.tsx`) — The main sharing UI. Handles:
  - Establishing or reusing the WebRTC peer connection.
  - File selection (click or drag-and-drop).
  - Chunked file sending with progress tracking and back-pressure control.
  - Receiving files via the Web Worker and triggering download.
  - Real-time text messaging over the data channel.
  - Connection status display (waiting → connecting → connected → disconnected).

- **`ToastProvider`** (`components/toast-provider.tsx`) — Sets up `react-hot-toast` globally.

- **`ThemeProvider`** (`hooks/useTheme.tsx`) — React context that manages light/dark theme state, persists it in `localStorage`, and toggles the `dark` class on `<html>`.

#### Utilities

- **`utils/socket.ts`** — Singleton Socket.IO client. Both the send and receive pages import the same `getSocket()` instance so the connection is reused across navigations.
- **`utils/peer.ts`** — Wraps the `simple-peer` library. Manages a single `Peer.Instance` with STUN (and optional TURN) ICE servers. Provides `createPeer(initiator)`, `getPeer()`, and `destroyPeer()`.

#### Styling

- **Tailwind CSS v4** with a custom warm color palette defined as CSS custom properties in `globals.css`.
- **Framer Motion** for page transitions and micro-interactions.
- **Lucide React** for icons.

#### Security Headers

`next.config.ts` adds security headers to every response:

- `X-Frame-Options: DENY` — prevents clickjacking.
- `X-Content-Type-Options: nosniff` — prevents MIME-type sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `X-DNS-Prefetch-Control: on`.

---

### Signaling Server (Express + Socket.IO)

Located in `server/server.ts`. A lightweight Node.js server whose sole job is WebRTC signaling — it never sees file contents.

#### Room Management

- Rooms are identified by short string IDs (max 64 characters).
- Each room allows a maximum of **2 sockets** (one sender, one receiver).
- Data structures:
  - `roomIdToSockets` — maps a room ID to its array of socket IDs.
  - `socketToRoomId` — reverse lookup from a socket ID to its room.
  - `roomCreatedAt` — tracks when each room was created for cleanup.

#### Socket Events

| Event                       | Direction       | Description                                                                         |
| --------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| `join room`                 | Client → Server | Join or create a room by ID. Returns `all users` (existing members) or `room full`. |
| `all users`                 | Server → Client | List of socket IDs already in the room (so the newcomer knows whom to signal).      |
| `sending signal`            | Client → Server | Forwards an SDP offer from the initiator to the target peer.                        |
| `user joined`               | Server → Client | Delivers the offer and caller ID to the existing peer.                              |
| `returning signal`          | Client → Server | Forwards the SDP answer back to the initiator.                                      |
| `receiving returned signal` | Server → Client | Delivers the answer to the initiator, completing the handshake.                     |
| `room full`                 | Server → Client | Emitted when a third user tries to join a 2-member room.                            |
| `user left`                 | Server → Client | Notifies the remaining peer when someone disconnects.                               |
| `disconnect`                | Built-in        | Cleans up room mappings and notifies peers.                                         |

#### Rate Limiting

Per-socket middleware tracks message counts. Each socket is allowed **30 messages per 1-second window**. Exceeding the limit rejects the event with an error.

#### Zombie Room Cleanup

A `setInterval` runs every 60 seconds and removes any room older than 1 hour, cleaning up associated socket mappings.

#### CORS

The server accepts connections only from the origin specified by the `ALLOWED_ORIGIN` environment variable (defaults to `http://localhost:3000`).

#### Health Check

`GET /health` returns JSON with the current number of active rooms and connected sockets.

#### Graceful Shutdown

On `SIGTERM` or `SIGINT`, the server emits a `server-shutdown` event to all clients, closes the Socket.IO server, then the HTTP server, and exits. A 10-second timeout forces exit if cleanup stalls.

---

### WebRTC Peer Connection

The connection is managed through `simple-peer`, a wrapper around the browser's `RTCPeerConnection` API.

- **ICE servers**: Google's public STUN server (`stun:stun.l.google.com:19302`) is always configured. Optional TURN server credentials can be supplied via environment variables for NAT traversal in restrictive networks.
- **Trickle ICE is disabled** (`trickle: false`) — the full SDP (with all ICE candidates gathered) is exchanged in a single signaling round-trip, simplifying the flow.
- **Single peer instance** — `peer.ts` maintains a module-level reference. Only one connection exists at a time; calling `createPeer()` destroys any previous one.

---

### File Transfer Protocol

Files are sent as raw binary chunks over the WebRTC data channel:

1. The sender reads the file in **64 KB slices** using `File.slice()` and `arrayBuffer()`.
2. Each slice is written to the peer via `peer.write(buffer)`.
3. **Back-pressure**: if the data channel's `bufferedAmount` exceeds 1 MB, the sender waits for the `bufferedamountlow` event before continuing.
4. After all chunks are sent, a JSON control message `{ done: true, fileName: "..." }` is sent to signal completion.
5. On the receiving side, binary chunks are forwarded to a **Web Worker** for assembly; the control message triggers the download.

Text messages are sent as JSON `{ type: "text", text: "..." }` over the same channel and handled inline (not forwarded to the worker).

Transfers can be cancelled via an `AbortController`.

---

### Web Worker

`public/worker.js` runs in a dedicated Web Worker thread to avoid blocking the main UI during large file assemblies.

- **Accumulation**: binary chunks received via `postMessage` are pushed into an array.
- **Download**: when the main thread sends the string `"download"`, the worker assembles all chunks into a single `Blob`, posts it back, and resets its buffer.
- **Text filtering**: string messages are ignored by the worker (handled on the main thread).

---

## Project Structure

```
flashit/
├── client/                      # Next.js frontend
│   ├── app/
│   │   ├── globals.css          # Tailwind + theme CSS variables
│   │   ├── layout.tsx           # Root layout (ThemeProvider, ToastProvider)
│   │   ├── page.tsx             # Landing page
│   │   ├── send/page.tsx        # Room creation + waiting screen
│   │   ├── receive/page.tsx     # Join room by code
│   │   └── share/[roomId]/
│   │       └── page.tsx         # Dynamic route → ShareClient
│   ├── components/
│   │   ├── ShareClient.tsx      # Main file/text sharing UI
│   │   └── toast-provider.tsx   # react-hot-toast setup
│   ├── hooks/
│   │   └── useTheme.tsx         # Light/dark theme context
│   ├── public/
│   │   └── worker.js            # Web Worker for file chunk assembly
│   ├── types/
│   │   └── global.d.ts          # Shared TypeScript interfaces
│   ├── utils/
│   │   ├── peer.ts              # simple-peer wrapper
│   │   └── socket.ts            # Socket.IO singleton
│   ├── next.config.ts           # Security headers
│   ├── package.json
│   └── tsconfig.json
│
├── server/                      # Signaling server
│   ├── server.ts                # Express + Socket.IO server
│   └── package.json
│
└── README.md                    # ← You are here
```

---

## Tech Stack

| Layer               | Technology                           |
| ------------------- | ------------------------------------ |
| Frontend framework  | Next.js 16 (App Router, React 19)    |
| Styling             | Tailwind CSS v4, Framer Motion       |
| Icons               | Lucide React                         |
| Peer-to-peer        | simple-peer (WebRTC)                 |
| Signaling transport | Socket.IO (client + server)          |
| Server runtime      | Node.js, Express 5                   |
| Dev tooling         | TypeScript, tsx (watch mode), ESLint |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** (comes with Node.js)

### Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Environment Variables

#### Server (`server/`)

| Variable         | Default                 | Description                                                             |
| ---------------- | ----------------------- | ----------------------------------------------------------------------- |
| `PORT`           | `8000`                  | Port the signaling server listens on.                                   |
| `ALLOWED_ORIGIN` | `http://localhost:3000` | CORS origin for Socket.IO. Set this to your client's URL in production. |

#### Client (`client/`)

| Variable                    | Default                 | Description                                 |
| --------------------------- | ----------------------- | ------------------------------------------- |
| `NEXT_PUBLIC_SIGNALING_URL` | `http://localhost:8000` | URL of the signaling server.                |
| `NEXT_PUBLIC_TURN_URL`      | _(none)_                | Optional TURN server URL for NAT traversal. |
| `NEXT_PUBLIC_TURN_USER`     | _(none)_                | TURN server username.                       |
| `NEXT_PUBLIC_TURN_CRED`     | _(none)_                | TURN server credential.                     |

### Run in Development

Open two terminal windows:

```bash
# Terminal 1 — start the signaling server
cd server
npm run dev
# Runs on http://localhost:8000
```

```bash
# Terminal 2 — start the Next.js dev server
cd client
npm run dev
# Runs on http://localhost:3000
```

Open `http://localhost:3000` in your browser.

---

## Production Build

```bash
# Build the Next.js client
cd client
npm run build
npm start
```

For the server, compile TypeScript and run with Node directly, or use `tsx`:

```bash
cd server
npx tsx server.ts
```

Set `ALLOWED_ORIGIN` on the server and `NEXT_PUBLIC_SIGNALING_URL` on the client to the appropriate production URLs.

---

## Contributing

Contributions are welcome. Here's how to get going:

1. **Fork** the repository and clone your fork.
2. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feat/my-feature
   ```
3. **Install dependencies** for both `client/` and `server/` as described above.
4. **Make your changes** — try to keep commits focused and well-described.
5. **Test locally** — run both the server and client in dev mode and verify your changes work end-to-end.
6. **Open a pull request** against the `main` branch with a clear description of what you changed and why.

### Guidelines

- Follow the existing code style (TypeScript, functional components, Tailwind utility classes).
- Keep the signaling server minimal — it should not handle or store file data.
- Avoid adding heavy dependencies; the project intentionally keeps its footprint small.
- If adding a new environment variable, document it in this README.
