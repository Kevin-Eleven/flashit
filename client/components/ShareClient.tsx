"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  Upload,
  Send,
  FileText,
  X,
  ArrowLeft,
  CheckCircle,
  Download,
} from "lucide-react";
import { getSocket, disconnectSocket } from "@/utils/socket";
import { createPeer, getPeer, destroyPeer } from "@/utils/peer";

export default function ShareClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // const [files, setFiles] = useState<UploadedFile[]>([]);
  // const [filesToSend, setFilesToSend] = useState<File[] | null>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [connected, setConnected] = useState(false);
  const [gotFile, setGotFile] = useState(false);
  const [receivedFileName, setReceivedFileName] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<TextMessage[]>([]);
  const [messageText, setMessageText] = useState("");

  useEffect(() => {
    const worker = new Worker("/worker.js");
    workerRef.current = worker;

    const existingPeer = getPeer();

    if (existingPeer) {
      // Came from /send or /receive — peer already connected
      setConnected(true);
      attachDataHandler(existingPeer, worker);
    } else {
      // Direct link visit — need to join room and do signaling
      const socket = getSocket();
      socket.emit("join room", roomId);

      socket.on("all users", (users: string[]) => {
        if (users.length > 0) {
          const peer = createPeer(true);

          peer.on("signal", (signal: any) => {
            socket.emit("sending signal", {
              userToSignal: users[0],
              callerID: socket.id,
              signal,
            });
          });

          peer.on("connect", () => setConnected(true));
          attachDataHandler(peer, worker);
        }
      });

      socket.on("user joined", (payload: any) => {
        const peer = createPeer(false);

        peer.on("signal", (signal: any) => {
          socket.emit("returning signal", {
            signal,
            callerID: payload.callerID,
          });
        });

        peer.on("connect", () => setConnected(true));
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
    }

    return () => {
      worker.terminate();
      disconnectSocket();
      destroyPeer();
    };
  }, []);

  // function attachDataHandler(peer: any, worker: Worker) {
  //   peer.on("data", (data: any) => {
  //     const str = data.toString();
  //     if (str.includes("done")) {
  //       const parsed = JSON.parse(str);
  //       setReceivedFileName(parsed.fileName);
  //       setGotFile(true);
  //     } else {
  //       worker.postMessage(data);
  //     }
  //   });
  // }

  // function attachDataHandler(peer: any, worker: Worker) {
  //   peer.on("data", (data: any) => {
  //     // Control messages are always sent as strings, binary chunks are ArrayBuffer/Buffer
  //     if (typeof data === "string" || data instanceof Uint8Array === false) {
  //       try {
  //         const parsed = JSON.parse(data.toString());
  //         if (parsed.done) {
  //           setReceivedFileName(parsed.fileName);
  //           setGotFile(true);
  //         } else if (parsed.type === "text") {
  //           // setMessages((prev) => [
  //           //   ...prev,
  //           //   {
  //           //     id: crypto.randomUUID(),
  //           //     text: parsed.text,
  //           //     timestamp: new Date().toLocaleTimeString(),
  //           //     fromMe: false,
  //           //   },
  //           // ]);
  //         }
  //       } catch {
  //         // JSON parse failed — treat as binary chunk
  //         worker.postMessage(data);
  //       }
  //     } else {
  //       // It's a binary chunk — send directly to worker
  //       worker.postMessage(data);
  //     }
  //   });
  // }
  function attachDataHandler(peer: any, worker: Worker) {
    peer.on("data", (data: any) => {
      // simple-peer always delivers Buffer — try to parse as JSON control message first
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
        // Not JSON — it's a binary chunk
      }
      worker.postMessage(data);
    });
  }

  function handleDownload() {
    // setGotFile(false);
    // const worker = workerRef.current;
    // if (!worker) return;

    // worker.postMessage("download");
    // worker.addEventListener(
    //   "message",
    //   (event) => {
    //     const stream = event.data.stream();
    //     const fileStream = streamSaver.createWriteStream(receivedFileName);
    //     stream.pipeTo(fileStream);
    //   },
    //   { once: true },
    // );
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
        // URL.revokeObjectURL(url);
        setTimeout(() => URL.revokeObjectURL(url), 10000); // ← revoke after delay
      },
      { once: true },
    );
  }

  // function sendFile(file: File) {
  //   const peer = getPeer();
  //   if (!peer) return;

  //   setSending(true);
  //   const stream = file.stream();
  //   const reader = stream.getReader();

  //   function handleReading(done: boolean, value?: Uint8Array) {
  //     if (done) {
  //       peer.write(JSON.stringify({ done: true, fileName: file.name }));
  //       setSending(false);
  //       toast.success(`Sent ${file.name}`);
  //       return;
  //     }
  //     peer.write(value);
  //     reader.read().then(({ done, value }) => handleReading(done, value));
  //   }

  //   reader.read().then(({ done, value }) => handleReading(done, value));
  // }
  async function sendFile(file: File) {
    const peer = getPeer();
    if (!peer) return;

    const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > MAX_SIZE) {
      toast.error("File too large. Maximum size is 2GB.");
      return;
    }

    setSending(true);

    const CHUNK_SIZE = 64 * 1024; // 64KB
    const BUFFER_THRESHOLD = 1 * 1024 * 1024; // 1MB

    let offset = 0;

    while (offset < file.size) {
      // Pause if buffer is too full
      if (peer._channel.bufferedAmount >= BUFFER_THRESHOLD) {
        await new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            if (peer._channel.bufferedAmount < BUFFER_THRESHOLD) {
              clearInterval(interval);
              resolve();
            }
          }, 50);
        });
      }

      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      peer.write(Buffer.from(buffer));
      offset += CHUNK_SIZE;
    }

    // At end of sendFile, change:
    // peer.write(JSON.stringify({ done: true, fileName: file.name }));
    // To:
    peer.send(JSON.stringify({ done: true, fileName: file.name }));
    setSending(false);
    toast.success(`Sent ${file.name}`);
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      setFiles((prev) => [...prev, ...Array.from(selectedFiles)]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) {
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
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
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-[0.875rem] text-muted-foreground">
            {connected ? "Connected" : "Connecting..."}
          </span>
        </motion.div>
      </div>

      {/* Received file download prompt */}
      {gotFile && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto w-full mb-6 bg-card rounded-2xl p-5 border border-border flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 text-primary" />
            <span className="text-foreground">
              Received file: <strong>{receivedFileName}</strong>
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

          {/* Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300
              ${
                dragOver
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
              Any file type, up to 100MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* File List */}
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
                    onClick={() => sendFile(file)}
                    disabled={!connected || sending}
                    className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[0.75rem] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Send
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

          {/* Messages Area */}
          <div className="bg-card rounded-2xl border border-border shadow-sm shadow-black/5 flex-1 flex flex-col min-h-[300px] lg:min-h-0">
            <div className="flex-1 p-5 overflow-y-auto space-y-3">
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
                      className={`flex ${msg.fromSelf ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`${
                          msg.fromSelf
                            ? "bg-primary/10 rounded-2xl rounded-br-md"
                            : "bg-muted rounded-2xl rounded-bl-md"
                        } px-4 py-3 max-w-[85%]`}
                      >
                        <p className="text-[0.9375rem] text-foreground break-words">
                          {msg.text}
                        </p>
                        <p className="text-[0.6875rem] text-muted-foreground mt-1 text-right">
                          {msg.timestamp}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-border">
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
                  placeholder="Type your message..."
                  rows={2}
                  className="flex-1 bg-background rounded-xl px-4 py-3 text-[0.9375rem] text-foreground placeholder:text-muted-foreground resize-none outline-none border border-border focus:border-primary/40 transition-colors"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSendMessage}
                  disabled={!messageText.trim()}
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
