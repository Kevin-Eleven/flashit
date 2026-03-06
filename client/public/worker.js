let chunks = [];

self.onmessage = (e) => {
  if (e.data === "download") {
    const blob = new Blob(chunks);
    chunks = [];
    self.postMessage(blob);
  } else {
    chunks.push(e.data);
  }
};
