const fetch = require('node-fetch');
const fs = require('fs');

// =========配置区=========
const SOURCE_LIST = [
  {
    url: "https://seep.eu.org/https://jh.807080747.workers.dev/"
  },
  {
    url: "https://seep.eu.org/https://raw.githubusercontent.com/buhanzhe/webSourceM3U8/refs/heads/main/webview.txt"
  },
  {
    url: "http://iptv.910501.xyz/"
  },
  {
    url: "http://wangziduoqing.cn/yuan/zb.txt"
  },
  {
    url: "https://seep.eu.org/https://iptv.445569.xyz/live.m3u"
  }
];

const GLOBAL_TIMEOUT = 15000;    // 拉取源超时
const TEST_TIMEOUT = 3000;       // 单个链接测速超时毫秒
const CONCURRENCY = 12;          // 并发测速数量
const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道"];
// ========================

let rawChannels = [];

// 过滤广告，存入频道列表
function pushChannel(name, url, group) {
  const isAd = adKeywords.some(word => name.includes(word) || group.includes(word));
  const invalidUrl = !url.startsWith("http");
  if (isAd || invalidUrl) return;
  rawChannels.push({ name, url, group });
}

// 拉取远程源内容，解析m3u/txt
async function fetchSource(sourceUrl) {
  console.log(`\n=====读取源：${sourceUrl}=====`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT);
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.log(`❌源访问失败 ${res.status}`);
      return;
    }
    const content = await res.text();
    const lines = content.split(/\r?\n/);
    let nowGroup = "未分组";
    let channelName = "未知频道";
    for (const line of lines) {
      const rawLine = line.trim();
      if (!rawLine) continue;
      // m3u EXTINF行，提取分组和频道名
      if (rawLine.startsWith("#EXTINF:")) {
        const gMatch = rawLine.match(/group-title="([^"]+)"/);
        if (gMatch) nowGroup = gMatch[1].trim();
        const nMatch = rawLine.match(/,(.*)$/);
        if (nMatch && nMatch[1].trim()) {
          channelName = nMatch[1].trim();
        }
        continue;
      }
      // txt分组标记
      if (rawLine.endsWith(",#genre#")) {
        nowGroup = rawLine.split(',')[0].trim();
        channelName = "未知频道";
        continue;
      }
      // txt格式 频道名,url
      if (rawLine.includes(',') && !rawLine.startsWith("#")) {
        const parts = rawLine.split(',');
        const cName = parts[0].trim();
        const cUrl = parts[1].trim();
        pushChannel(cName, cUrl, nowGroup);
        continue;
      }
      // 单独一行http链接
      if (rawLine.startsWith("http")) {
        pushChannel(channelName, rawLine, nowGroup);
      }
    }
    console.log(`✅源解析完成`);
  } catch (err) {
    clearTimeout(timer);
    console.error(`❌读取源出错：${sourceUrl}`);
  }
}

// 测速，返回延迟毫秒；失败返回 Infinity
async function testUrl(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TEST_TIMEOUT);
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      signal: ctl.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      method: "HEAD"
    });
    clearTimeout(t);
    if(resp.ok){
      return Date.now() - start;
    }else{
      return Infinity;
    }
  } catch (_e) {
    clearTimeout(t);
    return Infinity;
  }
}

// 并发限速批量测速
async function batchTest(list, concurrency) {
  const result = [];
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      const item = list[idx++];
      const delay = await testUrl(item.url);
      if (delay !== Infinity) {
        result.push({...item, delay});
      }
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return result;
}

async function run() {
  // 读取全部源
  for (const s of SOURCE_LIST) {
    await fetchSource(s.url);
  }
  console.log(`\n📥原始解析频道总数：${rawChannels.length}`);

  // 测速，只保留可访问链接，附带延迟
  const validList = await batchTest(rawChannels, CONCURRENCY);
  console.log(`✅测速可用频道数量：${validList.length}`);

  // 按分组整理，分组内部按延迟从小到大排序，速度快排前面
  const groupMap = new Map();
  for (const ch of validList) {
    const g = ch.group || "未分组";
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g).push(ch);
  }
  let outTxt = [];
  for (const [gName, items] of groupMap) {
    outTxt.push(`${gName},#genre#`);
    // 本组内按测速延迟升序，越快越靠前
    items.sort((a,b)=> a.delay - b.delay);
    for (const item of items) {
      outTxt.push(`${item.name},${item.url}`);
    }
  }
  fs.writeFileSync("./live.txt", outTxt.join("\n"), "utf8");
  console.log("\n🎉完成！已生成 live.txt，失效链接全部剔除，同分组内速度快的排在上方");
}

run().catch(e=>console.error(e));
