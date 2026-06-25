"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import type Peer from "simple-peer";
import { showSaveFilePicker } from "native-file-system-adapter";
import { getPeer } from "@/utils/peer";
import type { DataMessage } from "@/types/signaling";

// Owns outgoing file selection/sending and incoming file receive/download
// state for a single peer data channel. Only one file may transfer at a
// time — the data channel and the receiver's worker have no per-file
// framing, so concurrent sends would interleave.
export function useFileTransfer() {
  const [files, setFiles] = useState<File[]>([]);
  const [fileProgress, setFileProgress] = useState<Record<number, number>>(
    {},
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [receiveProgress, setReceiveProgress] = useState<number | null>(null);
  const [receivingFileName, setReceivingFileName] = useState("");
  const receiveRef = useRef<{ total: number; received: number }>({
    total: 0,
    received: 0,
  });
  const [gotFile, setGotFile] = useState(false);
  const [receivedFileName, setReceivedFileName] = useState("");

  // Single data-channel consumer: dispatches text frames to onText, handles
  // file-start/done control frames itself, and forwards binary chunks to
  // the worker for assembly.
  function attachToPeer(
    peer: Peer.Instance,
    worker: Worker,
    onText: (text: string) => void,
  ) {
    peer.on("data", (data: Buffer | string) => {
      const str =
        typeof data === "string" ? data : new TextDecoder().decode(data);
      try {
        const parsed = JSON.parse(str) as DataMessage;
        if ("done" in parsed && parsed.done) {
          setReceivedFileName(parsed.fileName);
          setGotFile(true);
          setReceiveProgress(null);
          return;
        }
        if ("type" in parsed && parsed.type === "file-start") {
          receiveRef.current = { total: parsed.size, received: 0 };
          setReceivingFileName(parsed.fileName);
          setReceiveProgress(0);
          setGotFile(false);
          return;
        }
        if ("type" in parsed && parsed.type === "text") {
          onText(parsed.text);
          return;
        }
      } catch {
        // binary chunk — track progress, then hand off to the worker
        const r = receiveRef.current;
        if (r.total > 0) {
          r.received += (data as Buffer).byteLength;
          setReceiveProgress(
            Math.min(100, Math.round((r.received / r.total) * 100)),
          );
        }
      }
      worker.postMessage(data);
    });
  }

  function handleDownload(worker: Worker | null) {
    setGotFile(false);
    if (!worker) return;

    const fileName = receivedFileName;
    worker.postMessage("download");
    worker.addEventListener(
      "message",
      async (event: MessageEvent<Blob>) => {
        const blob = event.data;
        // Prefer streaming to a user-chosen location (real Save dialog,
        // ponyfilled across browsers, no object-URL leak).
        try {
          const handle = await showSaveFilePicker({ suggestedName: fileName });
          const writable = await handle.createWritable();
          await blob.stream().pipeTo(writable);
          toast.success(`Saved ${fileName}`);
          return;
        } catch (err) {
          // User dismissed the picker — don't fall through to an auto-download.
          if (err instanceof Error && err.name === "AbortError") return;
          // Otherwise (e.g. unsupported) fall back to a plain anchor download.
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
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
    setActiveIndex(index);

    setFileProgress((prev) => ({ ...prev, [index]: 0 }));

    const CHUNK_SIZE = 64 * 1024;
    const BUFFER_THRESHOLD = 1 * 1024 * 1024;
    let offset = 0;

    // Announce the transfer so the receiver can show real progress.
    const startMsg: DataMessage = {
      type: "file-start",
      fileName: file.name,
      size: file.size,
    };
    peer.send(JSON.stringify(startMsg));

    try {
      while (offset < file.size) {
        if (abort.signal.aborted) {
          toast("Transfer cancelled");
          break;
        }

        // simple-peer doesn't expose the underlying channel in its types.
        const channel = (peer as unknown as { _channel: RTCDataChannel })
          ._channel;
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
        setFileProgress((prev) => ({
          ...prev,
          [index]: Math.min(100, Math.round((offset / file.size) * 100)),
        }));
      }

      if (!abort.signal.aborted) {
        const done: DataMessage = { done: true, fileName: file.name };
        peer.send(JSON.stringify(done));
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
      setActiveIndex(null);
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
    if (e.dataTransfer.files)
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return {
    files,
    fileProgress,
    activeIndex,
    abortRef,
    receiveProgress,
    receivingFileName,
    gotFile,
    receivedFileName,
    attachToPeer,
    handleDownload,
    sendFile,
    handleFileSelect,
    handleDrop,
    removeFile,
  };
}
