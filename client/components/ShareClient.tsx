"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  Upload,
  Send,
  FileText,
  X,
  ArrowLeft,
  Download,
  Copy,
  Users,
  WifiOff,
  RefreshCw,
  Clock,
} from "lucide-react";
import { getSocket, disconnectSocket } from "@/utils/socket";
import { createPeer, getPeer, destroyPeer } from "@/utils/peer";

type ConnectionStatus = "waiting" | "connecting" | "connected" | "disconnected";

export default function ShareClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("waiting");
  const [gotFile, setGotFile] = useState(false);
  const [receivedFileName, setReceivedFileName] = useState("");

  const [fileProgress, setFileProgress] = useState<Record<number, number>>({});

  const abortRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<TextMessage[]>([]);
  const [messageText, setMessageText] = useState("");

  const isConnected = connectionStatus === "connected";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const worker = new Worker("/worker.js");
    workerRef.current = worker;

    const existingPeer = getPeer();

    if (existingPeer) {
      setConnectionStatus("connected");
      attachDataHandler(existingPeer, worker);
    } else {
      const socket = getSocket();
      socket.emit("join room", roomId);

      socket.on("all users", (users: string[]) => {
        if (users.length === 0) {
          setConnectionStatus("waiting");
          return;
        }

        setConnectionStatus("connecting");
        const peer = createPeer(true);

        peer.on("signal", (signal: any) => {
          socket.emit("sending signal", {
            userToSignal: users[0],
            callerID: socket.id,
            signal,
          });
        });

        peer.on("connect", () => setConnectionStatus("connected"));
        peer.on("error", () => handlePeerError());
        peer.on("close", () => handlePeerClose());
        attachDataHandler(peer, worker);
      });

      socket.on("user joined", (payload: any) => {
        setConnectionStatus("connecting");
        const peer = createPeer(false);

        peer.on("signal", (signal: any) => {
          socket.emit("returning signal", {
            signal,
            callerID: payload.callerID,
          });
        });

        peer.on("connect", () => setConnectionStatus("connected"));
        peer.on("error", () => handlePeerError());
        peer.on("close", () => handlePeerClose());
        attachDataHandler(peer, worker);
        peer.signal(payload.signal);
      });

      socket.on("receiving returned signal", (payload: any) => {
        getPeer()?.signal(payload.signal);
      });

      socket.on("room full", () => {
        toast.error("Room is full");
        router.push("/");
      });

      socket.on("user left", () => handlePeerClose());
      socket.on("disconnect", () => setConnectionStatus("disconnected"));
    }

    return () => {
      worker.terminate();
      disconnectSocket();
      destroyPeer();
    };
  }, []);

  function handlePeerError() {
    setConnectionStatus("disconnected");
    destroyPeer();
  }

  function handlePeerClose() {
    setConnectionStatus("disconnected");
    destroyPeer();
  }

  function attachDataHandler(peer: any, worker: Worker) {
    peer.on("data", (data: any) => {
      const str =
        typeof data === "string" ? data : new TextDecoder().decode(data);
      try {
        const parsed = JSON.parse(str);
        if (parsed.done) {
          setReceivedFileName(parsed.fileName);
          setGotFile(true);
          return;
        }
        if (parsed.type === "text") {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              text: parsed.text,
              timestamp: new Date().toLocaleTimeString(),
              fromSelf: false,
            },
          ]);
        }
      } catch {
        // binary chunk
      }
      worker.postMessage(data);
    });
  }

  function handleDownload() {
    setGotFile(false);
    const worker = workerRef.current;
    if (!worker) return;

    worker.postMessage("download");
    worker.addEventListener(
      "message",
      (event) => {
        const blob = event.data;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = receivedFileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
      { once: true },
    );
  }

  async function sendFile(file: File, index: number) {
    const peer = getPeer();
    if (!peer) return;

    const MAX_SIZE = 1 * 1024 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error("File too large. Maximum size is 1GB.");
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;

    setFileProgress((prev) => ({ ...prev, [index]: 0 }));

    const CHUNK_SIZE = 64 * 1024;
    const BUFFER_THRESHOLD = 1 * 1024 * 1024;
    let offset = 0;

    try {
      while (offset < file.size) {
        if (abort.signal.aborted) {
          toast("Transfer cancelled");
          break;
        }

        const channel = (peer as any)._channel as RTCDataChannel;
        if (channel.bufferedAmount >= BUFFER_THRESHOLD) {
          await new Promise<void>((resolve, reject) => {
            channel.bufferedAmountLowThreshold = BUFFER_THRESHOLD / 2;
            channel.onbufferedamountlow = () => {
              channel.onbufferedamountlow = null;
              resolve();
            };
            abort.signal.addEventListener(
              "abort",
              () => reject(new Error("cancelled")),
              { once: true },
            );
          });
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();
        peer.write(Buffer.from(buffer));
        offset += CHUNK_SIZE;
        // setSendProgress(Math.min(100, Math.round((offset / file.size) * 100)));
        setFileProgress((prev) => ({
          ...prev,
          [index]: Math.min(100, Math.round((offset / file.size) * 100)),
        }));
      }

      if (!abort.signal.aborted) {
        peer.send(JSON.stringify({ done: true, fileName: file.name }));
        toast.success(`Sent ${file.name}`);
      }
    } catch {
      // cancelled or error
    } finally {
      setFileProgress((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      abortRef.current = null;
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const selectedFiles = e.target.files;
    if (selectedFiles)
      setFiles((prev) => [...prev, ...Array.from(selectedFiles)]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files)
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = () => {
    const text = messageText.trim();
    if (!text) return;
    const peer = getPeer();
    if (!peer) return;

    peer.write(JSON.stringify({ type: "text", text }));
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text,
        timestamp: new Date().toLocaleTimeString(),
        fromSelf: true,
      },
    ]);
    setMessageText("");
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const statusConfig = {
    waiting: { color: "bg-amber-400", label: "Waiting for someone..." },
    connecting: { color: "bg-blue-400 animate-pulse", label: "Connecting..." },
    connected: { color: "bg-green-500", label: "Connected" },
    disconnected: { color: "bg-red-500", label: "Disconnected" },
  }[connectionStatus];

  const renderOverlay = () => {
    if (connectionStatus === "waiting") {
      return (
        <motion.div
          key="waiting"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-card/95 backdrop-blur-sm border border-border gap-5 p-8 text-center"
        >
          {/* Pulsing ring */}
          <div className="relative flex items-center justify-center">
            <span className="absolute w-16 h-16 rounded-full bg-amber-400/20 animate-ping" />
            <div className="w-14 h-14 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
              <Users className="w-6 h-6 text-amber-400" />
            </div>
          </div>
          <div>
            <p className="text-foreground font-medium text-lg mb-1">
              Waiting for someone to join
            </p>
            <p className="text-muted-foreground text-sm">
              Share this room link with the other person. This page will update
              automatically when they connect.
            </p>
          </div>
          {/* Copyable room link */}
          <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-full px-4 py-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">
              {roomId}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success("Room link copied!");
              }}
              className="ml-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Copy room link"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      );
    }

    if (connectionStatus === "disconnected") {
      return (
        <motion.div
          key="disconnected"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-card/95 backdrop-blur-sm border border-red-500/20 gap-5 p-8 text-center"
        >
          <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <WifiOff className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-foreground font-medium text-lg mb-1">
              Connection lost
            </p>
            <p className="text-muted-foreground text-sm">
              The other person disconnected or left the room. Your transferred
              files and messages are still visible.
            </p>
          </div>
          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push("/")}
              className="px-5 py-2.5 rounded-full border border-border text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              Go home
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Rejoin room
            </motion.button>
          </div>
        </motion.div>
      );
    }

    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col px-6 py-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8 max-w-6xl mx-auto w-full">
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </motion.button>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-2"
        >
          <div className={`w-2.5 h-2.5 rounded-full ${statusConfig.color}`} />
          <span className="text-[0.875rem] text-muted-foreground">
            {statusConfig.label}
          </span>
        </motion.div>
      </div>

      {/* Received file download prompt */}
      <AnimatePresence>
        {gotFile && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-6xl mx-auto w-full mb-6 bg-card rounded-2xl p-5 border border-border flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-primary" />
              <span className="text-foreground">
                Received: <strong>{receivedFileName}</strong>
              </span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDownload}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-[0.875rem] cursor-pointer"
            >
              Download
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: File Upload */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col"
        >
          <h3 className="text-foreground mb-4">File Sharing</h3>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (isConnected) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => isConnected && fileInputRef.current?.click()}
            className={`
              flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed transition-all duration-300
              ${!isConnected ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
              ${
                dragOver && isConnected
                  ? "border-primary bg-primary/5 scale-[1.02]"
                  : "border-border bg-card hover:border-primary/40 hover:bg-card/80"
              }
            `}
          >
            <motion.div
              animate={dragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
              className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5"
            >
              <Upload className="w-7 h-7 text-primary" />
            </motion.div>
            <p className="text-foreground mb-1">
              Drag files here or click to upload
            </p>
            <p className="text-[0.875rem] text-muted-foreground">
              Any file type, up to 1GB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          <div className="mt-4 space-y-3 flex-1 overflow-y-auto max-h-[300px]">
            <AnimatePresence>
              {files.map((file, index) => (
                <motion.div
                  key={`${file.name}-${index}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-card rounded-xl p-4 shadow-sm shadow-black/5 border border-border flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.875rem] text-foreground truncate">
                      {file.name}
                    </p>
                    <p className="text-[0.75rem] text-muted-foreground">
                      {file.size}
                    </p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      if (
                        fileProgress[index] !== undefined &&
                        abortRef.current
                      ) {
                        abortRef.current.abort();
                      } else {
                        sendFile(file, index); // pass index here
                      }
                    }}
                    disabled={!isConnected}
                    className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[0.75rem] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {fileProgress[index] !== undefined
                      ? `${fileProgress[index]}%`
                      : "Send"}
                  </motion.button>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Right: Text Sharing */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col"
        >
          <h3 className="text-foreground mb-4">Text Sharing</h3>

          <div className="relative bg-card rounded-2xl border border-border shadow-sm shadow-black/5 flex flex-col h-[420px] lg:h-[500px]">
            {/* Waiting / Disconnected overlay */}
            <AnimatePresence>{renderOverlay()}</AnimatePresence>

            {/* Scrollable message list */}
            <div className="flex-1 p-5 overflow-y-auto space-y-3 min-h-0">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-[0.875rem]">
                  No messages yet. Start typing below.
                </div>
              ) : (
                <AnimatePresence>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex items-end gap-1.5 ${msg.fromSelf ? "justify-end" : "justify-start"}`}
                    >
                      {!msg.fromSelf && (
                        <div className="bg-emerald-500/[0.12] border border-emerald-500/20 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[78%] group relative">
                          <p className="text-[0.9375rem] text-foreground break-words leading-relaxed">
                            {msg.text}
                          </p>
                          <p className="text-[0.6563rem] text-emerald-400/60 mt-1">
                            {msg.timestamp}
                          </p>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleCopy(msg.text)}
                            className="absolute -right-2 -top-2 p-1 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          >
                            <Copy className="w-3 h-3" />
                          </motion.button>
                        </div>
                      )}

                      {msg.fromSelf && (
                        <div className="bg-indigo-500/[0.15] border border-indigo-500/25 rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[78%] group relative">
                          <p className="text-[0.9375rem] text-foreground break-words leading-relaxed">
                            {msg.text}
                          </p>
                          <p className="text-[0.6563rem] text-indigo-400/60 mt-1 text-right">
                            You · {msg.timestamp}
                          </p>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleCopy(msg.text)}
                            className="absolute -left-2 -top-2 p-1 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          >
                            <Copy className="w-3 h-3" />
                          </motion.button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border shrink-0">
              <div className="flex gap-3">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={!isConnected}
                  placeholder={
                    connectionStatus === "waiting"
                      ? "Waiting for someone to join..."
                      : connectionStatus === "disconnected"
                        ? "Connection lost"
                        : connectionStatus === "connecting"
                          ? "Connecting..."
                          : "Type your message... (Enter to send)"
                  }
                  rows={2}
                  className="flex-1 bg-background rounded-xl px-4 py-3 text-[0.9375rem] text-foreground placeholder:text-muted-foreground resize-none outline-none border border-border focus:border-primary/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || !isConnected}
                  className="self-end px-5 py-3 bg-primary text-primary-foreground rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  <Send className="w-5 h-5" />
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
