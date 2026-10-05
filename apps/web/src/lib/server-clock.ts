export type ServerClock = {
  /** Records how far the server clock is from ours at the moment a state arrives. */
  sync(serverNow: number): void;
  /** Local time shifted by the last known offset: the server's idea of "now". */
  now(): number;
};

export function createServerClock(): ServerClock {
  let offset = 0;
  return {
    sync(serverNow) {
      offset = serverNow - Date.now();
    },
    now: () => Date.now() + offset,
  };
}
