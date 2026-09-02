/**
 * 多 Provider 适配层。
 * 接口统一:async (prompt, negative, size) -> Buffer(png/jpg bytes)
 *
 * 通过 .env / 环境变量切换:
 *   PROVIDER=minimax|openai|replicate|zhipu|aliyun|custom
 *   各自配 *_API_KEY, *_*_MODEL
 *
 * 如添加新 provider:实现同名 export 即可,主脚本无需改。
 */

const fs = require('node:fs');
const path = require('node:path');

/** 通用:把远程 URL / dataURL / Buffer 规范化为 Buffer */
async function asBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string' && input.startsWith('data:')) {
    const b64 = input.split(',', 2)[1];
    return Buffer.from(b64, 'base64');
  }
  if (typeof input === 'string' && /^https?:\/\//.test(input)) {
    const res = await fetch(input);
    if (!res.ok) throw new Error(`fetch ${input} -> HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('provider 必须返回 Buffer / dataURL / http(s) URL');
}

/* ============================================================
 * 1) minimax
 *    ⚠ 文档 docs 是 platform.minimax.io,实际 API 在 api.minimaxi.com
 *    ⚠ docs 说 image_generation 用 image-01 模型 + size 限制 (image-01 旧行为)
 *    ⚠ 实测:response_format=base64 返回 JPEG 内容(后缀应写 .jpg)
 *    端点: POST https://api.minimaxi.com/v1/image_generation
 *    auth: Authorization: Bearer <API_KEY>
 *    请求体核心:{ model: "image-01", prompt, width, height, response_format: "base64"|"url", n: 1 }
 *    响应:{ data: { image_base64|image_urls }, base_resp: { status_code, status_msg } }
 * ============================================================ */
async function minimax(prompt, negative, size) {
  const url = process.env.MINIMAX_IMAGE_URL || 'https://api.minimaxi.com/v1/image_generation';
  const key = process.env.MINIMAX_API_KEY;
  const model = process.env.MINIMAX_IMAGE_MODEL || 'image-01';
  if (!key) throw new Error('minimax: MINIMAX_API_KEY 未配置');

  // 实测 image-01 不挑剔 size,允许更小。原 spec 限制仅作参考。
  // 但保留 snap 防御:8 倍数 + 不超过 2048
  const snap = (n) => Math.max(256, Math.min(2048, Math.round(n / 8) * 8));
  const w = snap(size.w);
  const h = snap(size.h);
  const body = {
    model,
    prompt,
    width: w,
    height: h,
    response_format: 'base64',
    n: 1,
    prompt_optimizer: false,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`minimax HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  if (json.base_resp?.status_code && json.base_resp.status_code !== 0) {
    throw new Error(`minimax status ${json.base_resp.status_code}: ${json.base_resp.status_msg}`);
  }
  // base64 模式:data.image_base64[0];url 模式:data.image_urls[0]
  if (Array.isArray(json.data?.image_urls) && json.data.image_urls.length) {
    return asBuffer(json.data.image_urls[0]);
  }
  if (Array.isArray(json.data?.image_base64) && json.data.image_base64.length) {
    // 实测:这模型给的是 JPEG(头 0xFF 0xD8 0xFF),不是 PNG。
    // mainloop 端按内容 magic 决定落盘后缀,这里保持原始字节。
    return Buffer.from(json.data.image_base64[0], 'base64');
  }
  throw new Error('minimax: 响应未含 image_base64 / image_urls');
}

/* ============================================================
 * 2) OpenAI DALL-E 3
 * ============================================================ */
async function openai(prompt, negative, size) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('openai: OPENAI_API_KEY 未配置');
  const model = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';
  // DALL-E 3 仅支持 1024x1024 / 1024x1792 / 1792x1024
  let apiSize = '1024x1792';
  if (size.w >= size.h) apiSize = '1792x1024';
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: apiSize,
      response_format: 'b64_json',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`openai HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  return asBuffer(json.data[0].b64_json);
}

/* ============================================================
 * 3) Replicate (SDXL / Flux)
 *    通过 predictions 接口,轮询结果。
 * ============================================================ */
async function replicate(prompt, negative, size) {
  const key = process.env.REPLICATE_API_KEY;
  const modelVersion = process.env.REPLICATE_MODEL_VERSION; // 例:黑辶 SDXL 的 version hash
  if (!key || !modelVersion) throw new Error('replicate: REPLICATE_API_KEY / REPLICATE_MODEL_VERSION 未配置');

  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Token ${key}`,
    },
    body: JSON.stringify({
      version: modelVersion,
      input: {
        prompt,
        negative_prompt: negative,
        width: size.w,
        height: size.h,
        num_outputs: 1,
      },
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '');
    throw new Error(`replicate create HTTP ${createRes.status}: ${text.slice(0, 500)}`);
  }
  const pred = await createRes.json();
  // 轮询
  const start = Date.now();
  while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
    if (Date.now() - start > 180_000) throw new Error('replicate: 超时(180s)');
    await new Promise((r) => setTimeout(r, 2500));
    const poll = await fetch(pred.urls.get, { headers: { authorization: `Token ${key}` } });
    Object.assign(pred, await poll.json());
  }
  if (pred.status !== 'succeeded') throw new Error(`replicate: ${pred.status} - ${pred.error}`);
  const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  return asBuffer(out);
}

/* ============================================================
 * 4) 智谱 CogView
 *    https://open.bigmodel.cn/api/paas/v4/images/generations
 * ============================================================ */
async function zhipu(prompt, negative, size) {
  const key = process.env.ZHIPU_API_KEY;
  if (!key) throw new Error('zhipu: ZHIPU_API_KEY 未配置');
  const model = process.env.ZHIPU_IMAGE_MODEL || 'cogview-3';
  const res = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, prompt, size: `${size.w}x${size.h}` }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`zhipu HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  // CogView 返回 data[].url
  const url = json?.data?.[0]?.url ?? json?.data?.[0]?.b64_json;
  if (!url) throw new Error('zhipu: 返回未含 url / b64_json');
  return asBuffer(url);
}

/* ============================================================
 * 5) 阿里通义 Wanxiang
 *    https://dashscope.aliycs.com/api/v1/services/aigc/text2image/image-synthesis
 *    异步任务模式:创建后轮询结果。
 * ============================================================ */
async function aliyun(prompt, negative, size) {
  const key = process.env.ALIYUN_API_KEY;
  if (!key) throw new Error('aliyun: ALIYUN_API_KEY 未配置');
  const model = process.env.ALIYUN_IMAGE_MODEL || 'wanx-v1';

  const create = await fetch(
    'https://dashscope.aliycs.com/api/v1/services/aigc/text2image/image-synthesis',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        input: { prompt, negative_prompt: negative },
        parameters: { size: `${size.w}*${size.h}`, n: 1 },
      }),
    },
  );
  if (!create.ok) {
    const text = await create.text().catch(() => '');
    throw new Error(`aliyun create HTTP ${create.status}: ${text.slice(0, 500)}`);
  }
  const { output } = await create.json();
  const taskId = output.task_id;
  const start = Date.now();
  while (true) {
    if (Date.now() - start > 180_000) throw new Error('aliyun: 超时');
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await fetch(
      `https://dashscope.aliycs.com/api/v1/tasks/${taskId}`,
      { headers: { authorization: `Bearer ${key}` } },
    );
    const json2 = await poll.json();
    if (json2?.output?.task_status === 'SUCCEEDED') {
      return asBuffer(json2.output.results[0].url);
    }
    if (json2?.output?.task_status === 'FAILED') {
      throw new Error(`aliyun: FAILED - ${json2.output.message ?? ''}`);
    }
  }
}

/* ============================================================
 * 6) custom:通过 GENERATE_IMAGE_URL(POST JSON)+ GENERATE_IMAGE_AUTH
 *    约定的请求体:{ prompt, negative, w, h }
 *    返回:{ b64 } 或 { url }
 * ============================================================ */
async function custom(prompt, negative, size) {
  const url = process.env.GENERATE_IMAGE_URL;
  if (!url) throw new Error('custom: GENERATE_IMAGE_URL 未配置');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.GENERATE_IMAGE_AUTH
        ? { authorization: process.env.GENERATE_IMAGE_AUTH }
        : {}),
    },
    body: JSON.stringify({ prompt, negative, w: size.w, h: size.h }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`custom HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  if (json.b64) return Buffer.from(json.b64, 'base64');
  if (json.url) return asBuffer(json.url);
  throw new Error('custom: 返回需含 b64 或 url');
}

/* ----------- 注册表 ----------- */

const REGISTRY = { minimax, openai, replicate, zhipu, aliyun, custom };

function pickProvider() {
  const name = (process.env.PROVIDER || 'minimax').toLowerCase();
  const fn = REGISTRY[name];
  if (!fn) {
    throw new Error(`未知 PROVIDER='${name}',可选: ${Object.keys(REGISTRY).join(', ')}`);
  }
  return { name, fn };
}

module.exports = { pickProvider };
