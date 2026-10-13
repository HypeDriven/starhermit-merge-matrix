export {};
declare global {
  var GameOptions: {
    draw<T>(renderer: unknown, callback: () => T): T | undefined;
    trackSource<T extends AudioNode>(node: T, hint: unknown): T;
    tagBus<T extends AudioNode>(node: T, name: unknown): T;
  } | undefined;
}
