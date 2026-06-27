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
  const [isSendingAll, setIsSendingAll] = useState(false);
  const stopSendAllRef = useRef(false);

  const [receiveProgress, setReceiveProgress] = useState<number | null>(null);
  const [receivingFileName, setReceivingFileName] = useState("");
  const receiveRef = useRef<{ total: number; received: number }>({
    total: 0,
    received: 0,
  });
  const [receivedFiles, setReceivedFiles] = useState<{ name: string; blob: Blob }[]>([]);

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
          setReceiveProgress(null);
          const fileName = parsed.fileName;
          worker.postMessage("download");
          worker.addEventListener(
            "message",
            (event: MessageEvent<Blob>) => {
              setReceivedFiles((prev) => [...prev, { name: fileName, blob: event.data }]);
            },
            { once: true },
          );
          return;
        }
        if ("type" in parsed && parsed.type === "file-start") {
          receiveRef.current = { total: parsed.size, received: 0 };
          setReceivingFileName(parsed.fileName);
          setReceiveProgress(0);
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

  async function handleDownload(file: { name: string; blob: Blob }) {
    setReceivedFiles((prev) => prev.filter((f) => f !== file));
    try {
      const handle = await showSaveFilePicker({ suggestedName: file.name });
      const writable = await handle.createWritable();
      await file.blob.stream().pipeTo(writable);
      toast.success(`Saved ${file.name}`);
      return;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast.success(`Downloaded ${file.name}`);
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
          stopSendAllRef.current = true;
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
        setFiles((prev) => prev.filter((_, i) => i !== index));
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

  async function sendAll() {
    if (isSendingAll) return;
    // Snapshot so additions during the run don't extend the queue.
    const snapshot = [...files];
    if (snapshot.length === 0) return;
    setIsSendingAll(true);
    stopSendAllRef.current = false;
    for (const file of snapshot) {
      if (stopSendAllRef.current) break;
      // Each successful send removes the file at index 0, so the next
      // file in the snapshot slides into index 0 automatically.
      await sendFile(file, 0);
      // If this file was aborted (not removed), stop the queue.
      if (abortRef.current === null && stopSendAllRef.current) break;
    }
    setIsSendingAll(false);
    stopSendAllRef.current = false;
  }

  function cancelAll() {
    stopSendAllRef.current = true;
    abortRef.current?.abort();
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
    isSendingAll,
    receiveProgress,
    receivingFileName,
    receivedFiles,
    attachToPeer,
    handleDownload,
    sendFile,
    sendAll,
    cancelAll,
    handleFileSelect,
    handleDrop,
    removeFile,
  };
}
