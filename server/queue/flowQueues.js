import { Queue } from 'bullmq';
import { getBullConnection } from './bullConnection.js';

let caches = null;

export function getFlowQueues() {
  if (!caches) {
    const connection = getBullConnection();
    const defaults = {
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 3500 },
        removeOnComplete: { age: 86400, count: 10000 },
        removeOnFail: { age: 604800, count: 5000 },
      },
    };
    caches = {
      prompt: new Queue('flow:prompt', { connection, ...defaults }),
      storyboard: new Queue('flow:storyboard', { connection, ...defaults }),
      image: new Queue('flow:image', { connection, ...defaults }),
      video: new Queue('flow:video', { connection, ...defaults }),
      merge: new Queue('flow:merge', { connection, ...defaults }),
    };
  }
  return caches;
}
