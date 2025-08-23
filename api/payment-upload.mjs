// /api/payment-upload.mjs
export const config = {
  runtime: 'nodejs'
};

import { put } from '@vercel/blob';
import { kv } from '@vercel/kv';
import formidable from 'formidable';
import fs from 'node:fs/promises';
import path from 'node:path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  // 关闭 Vercel 内置的 body 解析，让 formidable 接管
  // （对 /api 纯函数生效；如果你是 Next API Route，可加 export const config = { api: { bodyParser: false } }）
  // 这里是独立 Vercel Function，不需要再额外配置。

  try {
    const form = formidable({
      multiples: false,
      maxFileSize: 8 * 1024 * 1024, // 8MB
      uploadDir: '/tmp',            // Vercel 可写临时目录
      keepExtensions: true
    });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
    });

    const orderId = (fields.orderId || '').toString().trim();
    const product = (fields.product || '').toString().trim();
    const notes   = (fields.notes || '').toString().trim();

    const file = files.file;
    if (!file) {
      res.status(400).json({ ok: false, error: 'No file' });
      return;
    }

    // 读临时文件，上传到 Vercel Blob（public）
    const data = await fs.readFile(file.filepath);
    const ext  = path.extname(file.originalFilename || '').toLowerCase() || '.jpg';
    const key  = `payments/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

    const blob = await put(key, data, { access: 'public', addRandomSuffix: false });

    // 写入 KV 支付记录（若已有 /api/payments 里会读）
    // 这里只演示最小字段；可按你现有 schema 扩展
    if (orderId) {
      await kv.hset(`payment:${orderId}`, {
        orderId,
        product,
        notes,
        screenshot: blob.url,
        status: '待审核',
        timestamp: Date.now()
      });
    }

    // 清理临时文件（可选）
    try { await fs.unlink(file.filepath); } catch {}

    res.status(200).json({ ok: true, url: blob.url });
  } catch (e) {
    console.error('upload error', e);
    res.status(500).json({ ok: false, error: 'upload_failed' });
  }
}
