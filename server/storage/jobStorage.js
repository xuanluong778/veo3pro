import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Redis } from 'ioredis';

/**
 * Pluggable job persistence — survives restarts (file / Redis).
 * Large binaries MUST NOT live inside Redis payloads (paths only).
 */

function resolveFlowRoot() {
  const raw = process.env.FLOW_DATA_DIR || path.join(process.cwd(), 'data', 'flow-jobs');
  return path.resolve(raw);
}

export async function ensureJobWorkspace(jobId) {
  const root = resolveFlowRoot();
  const dir = path.join(root, jobId);
  await fs.mkdir(path.join(dir, 'images'), { recursive: true });
  await fs.mkdir(path.join(dir, 'clips'), { recursive: true });
  await fs.mkdir(path.join(dir, 'final'), { recursive: true });
  return dir;
}

export function getJobAbsoluteDir(jobId) {
  return path.join(resolveFlowRoot(), jobId);
}

/** @typedef {{ save(job: object): Promise<void>, load(id: string): Promise<object|null>, patch(id: string, patch: object | ((j: object)=>object)): Promise<object|null>, listIds(): Promise<string[]> }} JobStorage */

export function createFileJobStorage() {
  const root = resolveFlowRoot();

  async function jobPath(id) {
    await fs.mkdir(root, { recursive: true });
    return path.join(root, id, 'job.json');
  }

  async function atomicWrite(filePath, jsonStr) {
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, jsonStr, 'utf8');
    await fs.rename(tmp, filePath);
  }

  return {
    async save(job) {
      const dir = await ensureJobWorkspace(job.id);
      const jp = path.join(dir, 'job.json');
      await atomicWrite(jp, JSON.stringify(job, null, 2));
    },

    async load(id) {
      const jp = path.join(root, id, 'job.json');
      try {
        const raw = await fs.readFile(jp, 'utf8');
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },

    async patch(id, patchOrFn) {
      const jp = path.join(root, id, 'job.json');
      let job;
      try {
        job = JSON.parse(await fs.readFile(jp, 'utf8'));
      } catch {
        return null;
      }
      const patch = typeof patchOrFn === 'function' ? patchOrFn(job) : patchOrFn;
      Object.assign(job, patch, { updatedAt: Date.now() });
      await atomicWrite(jp, JSON.stringify(job, null, 2));
      return job;
    },

    async listIds() {
      await fs.mkdir(root, { recursive: true });
      const dirs = await fs.readdir(root, { withFileTypes: true });
      const ids = [];
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const jp = path.join(root, d.name, 'job.json');
        if (fsSync.existsSync(jp)) ids.push(d.name);
      }
      return ids;
    },
  };
}

export function createRedisJobStorage() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL required when FLOW_STORAGE=redis');

  const redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });

  const key = (id) => `flow:job:${id}`;

  return {
    async save(job) {
      await redis.set(key(job.id), JSON.stringify(job));
    },

    async load(id) {
      const raw = await redis.get(key(id));
      return raw ? JSON.parse(raw) : null;
    },

    async patch(id, patchOrFn) {
      const raw = await redis.get(key(id));
      if (!raw) return null;
      const job = JSON.parse(raw);
      const patch = typeof patchOrFn === 'function' ? patchOrFn(job) : patchOrFn;
      Object.assign(job, patch, { updatedAt: Date.now() });
      await redis.set(key(id), JSON.stringify(job));
      return job;
    },

    async listIds() {
      const keys = await redis.keys('flow:job:*');
      return keys.map((k) => k.replace(/^flow:job:/, ''));
    },

    /** @internal */
    disconnect() {
      return redis.quit();
    },
  };
}

export function createJobStorageFromEnv() {
  const mode = (process.env.FLOW_STORAGE || 'file').toLowerCase();
  if (mode === 'redis') return createRedisJobStorage();
  return createFileJobStorage();
}
