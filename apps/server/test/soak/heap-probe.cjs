// Loaded into the server by the soak test only (`-r`, with --expose-gc): on request, collect garbage
// and report the live heap, so that growth in what the server keeps can be told from memory the
// operating system has simply not taken back yet.
process.on('message', (message) => {
  if (message?.type !== 'skb:heap') return;
  global.gc?.();
  const usage = process.memoryUsage();
  process.send?.({ type: 'skb:heap', heapUsed: usage.heapUsed, external: usage.external });
});
