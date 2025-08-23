// /api/payment-upload.js  （Serverless Edge Function）
export const config = { runtime: 'edge' };

import { kv } from '@vercel/kv';
import { put } from '@vercel/blob';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, 405);
  }

  // 解析表单
  const form = await req.formData();
  const orderId = (form.get('orderId') || '').toString().trim();
  const product = (form.get('product') || '').toString().trim();
  const storage = (form.get('storage') || '').toString().trim();
  const color   = (form.get('color')   || '').toString().trim();
  const price   = (form.get('price')   || '').toString().trim();
  const note    = (form.get('note')    || '').toString().trim();
  const file    = form.get('file');

  if (!orderId || !file || typeof file === 'string') {
    return json({ ok: false, message: 'Faltan datos: orderId o archivo' }, 400);
  }
  if (file.size > 8 * 1024 * 1024) {
    return json({ ok: false, message: 'El archivo supera 8MB' }, 413);
  }

  // 保存到 Vercel Blob（公开URL）
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const safeId = orderId.replace(/[^a-z0-9-_]/gi, '').slice(0, 40) || 'order';
  const key = `payments/${safeId}-${Date.now()}.${ext || 'jpg'}`;

  let url;
  try {
    const uploaded = await put(key, file, { access: 'public', addRandomSuffix: false });
    url = uploaded.url;
  } catch (e) {
    return json({ ok: false, message: 'Error al subir a Blob' }, 500);
  }

  // 写一条充值记录到 KV（列表 + 按订单分组）
  const rec = {
    orderId, product, storage, color, price, note,
    screenshot: url,
    status: '待审核',
    timestamp: Date.now(),
  };

  try {
    // 最近的所有充值（最多保留1000条）
    await kv.lpush('payments:all', JSON.stringify(rec));
    await kv.ltrim('payments:all', 0, 999);

    // 按订单号分组
    await kv.lpush(`payments:${orderId}`, JSON.stringify(rec));
    await kv.ltrim(`payments:${orderId}`, 0, 99);
  } catch (e) {
    return json({ ok: false, message: 'Error al guardar en KV' }, 500);
  }

  return json({ ok: true, url });
}
