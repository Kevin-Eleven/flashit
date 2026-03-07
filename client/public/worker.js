let chunks = [];

self.onmessage = (e) => {
  if (e.data === "download") {
    const blob = new Blob(chunks);
    chunks = [];
    self.postMessage(blob);
  } else if (typeof e.data !== "string") {
    // Only accumulate binary chunks — text messages are handled in main thread
    chunks.push(e.data);
  }
};
