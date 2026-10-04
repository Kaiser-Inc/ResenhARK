import { Redis } from "ioredis";

// ioredis enables TLS on its own when the URL scheme is rediss://.
export const createRedis = (url: string): Redis => new Redis(url);
