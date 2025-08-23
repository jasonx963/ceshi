// /api/payment-upload.mjs
import { put } from '@vercel/blob';
import Busboy from 'busboy';

export const config = {
  runtime: 'nodejs',            // 关键：用 Node.js Runtime
};

// 解析 multipart/form-data
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    const files = [];

    busboy.on('file', (fieldname, file, info) => {
      const { filename, mimeType } = info;  // busboy@1.6+ 写法
      const chunks = [];
      file.on('data', (d) => chunks.push(d));
      file.on('end', () => {
        files.push({
          fieldname,
          filename: filename || 'upload.bin',
          mimeType: mimeType || 'application/octet-stream',
          buffer: Buffer.concat(chunks),
        });
      });
    });

    busboy.on('field', (name, val) => {
      fields[name] = val;
    });

    busboy.on('error', reject);
    busboy.on('finish', () => resolve({ fields, files }));
    req.pipe(busboy);
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      return res.end('Method Not Allowed');
    }

    const { fields, files } = await parseMultipart(req);
    const f = files[0];
    if (!f) {
      return res.status(400).json({ ok: false, message: 'no file' });
    }

    // 拿到前端随表单传来的字段
    const orderId = fields.orderId || 'unknown';
    const product = fields.product || '';
    const note    = fields.note || '';

    // 生成保存路径（你可以按需改）
    const key = `payments/${orderId}/${Date.now()}-${f.filename.replace(/\s+/g, '_')}`;

    // 上传到 Vercel Blob（默认使用 BLOB_ 前缀的凭据；如你用了自定义前缀，传 token）
    const { url } = await put(
      key,
      f.buffer,
      {
        access: 'private',              // 或 'public'
        contentType: f.mimeType,
        // 如果你给 Blob 绑定的是自定义前缀（比如 BLOB2_），就取消下一行注释：
        // token: process.env.BLOB2_READ_WRITE_TOKEN,
      }
    );

    // 如果你还想把记录写入 KV，可以在这里写（略）
    // await kv.hset(`payment:${orderId}`, { url, product, note, ts: Date.now() });

    return res.status(200).json({ ok: true, url });
  } catch (err) {
    console.error('upload error:', err);
    return res.status(500).json({ ok: false, message: 'upload failed' });
  }
}
