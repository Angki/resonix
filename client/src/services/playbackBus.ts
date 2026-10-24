type SeekHandler = (seconds: number) => boolean | void;

const handlers = new Set<SeekHandler>();

export function subscribeToSeek(handler: SeekHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function requestSeek(seconds: number): boolean {
  let handled = false;
  for (const handler of handlers) {
    if (handler(seconds) !== false) handled = true;
  }
  return handled;
}
