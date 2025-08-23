// api/payment-upload.mjs
export const config = {
  // 一定要是 nodejs，而不是 edge 或 nodejs20.x
  runtime: 'nodejs',
};

import formidable from 'formidable';
import fs from 'fs/promises';
import { put } from '@vercel/blob';

function parseForm(req) {
  const form = formidable({
    multiples: false,
    maxFileSize: 8 * 1024 * 1024, // 8MB
    keepExtensions: true,
    uploadDir: '/tmp',            // Vercel 可写临时目录
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    const { fields, files } = await parseForm(req);
    const f = files?.file;
    if (!f) {
      res.status(400).json({ ok: false, message: 'No file received' });
      return;
    }

    // 读取临时文件到内存
    const filepath = f.filepath || f.path; // 不同版本字段名不同
    const buf = await fs.readFile(filepath);

    const orderId = String(fields.orderId || 'unknown');
    const original = (f.originalFilename || 'upload').replace(/\s+/g, '-');
    const filename = `payments/${Date.now()}-${orderId}-${original}`.replace(/[^a-zA-Z0-9._/-]/g, '_');

    // 上传到 Vercel Blob（公共可读）
    const { url } = await put(filename, buf, {
      access: 'public',
      contentType: f.mimetype || 'application/octet-stream',
    });

    // 你如果还想把这条记录写进 KV，可以在这里调用你现有的 /api/payments 或 /api/orders
    // 现在先返回 URL 即可
    res.status(200).json({ ok: true, url });
  } catch (err) {
    console.error('payment-upload error:', err);
    res.status(500).json({ ok: false, message: String(err?.message || err) });
  }
}
