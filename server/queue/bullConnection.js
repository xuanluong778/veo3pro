import IORedis from 'ioredis';

let shared = null;

export function getBullConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL required for BullMQ');
  if (!shared) {
    shared = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return shared;
}

export function duplicateConnection() {
  return getBullConnection().duplicate();
}
