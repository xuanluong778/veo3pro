const API = '/api';

const cred = { credentials: 'include' };

async function readJsonSafe(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw };
  }
}

export async function resolveProduct(url) {
  const q = new URLSearchParams({ url: String(url || '') });
  const r = await fetch(`${API}/product/resolve?${q.toString()}`, cred);
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data.error || 'Resolve sản phẩm thất bại');
  return data;
}

export async function fetchProductImageBlob(imageUrl) {
  const q = new URLSearchParams({ url: String(imageUrl || '') });
  const r = await fetch(`${API}/product/image?${q.toString()}`, { ...cred });
  if (!r.ok) {
    const data = await readJsonSafe(r);
    throw new Error(data.error || 'Tải ảnh thất bại');
  }
  return await r.blob();
}

