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

const GLOBAL_TIMEOUT = 15000;       // 拉取源超时
const TEST_TIMEOUT = 3000;          // 单链接测速超时(毫秒)
const CONCURRENCY = 12;             // 测速并发数量，不要开太大
const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道"];
// ========================

// 原始收集：name,url,group
let rawChannels = [];

function pushChannel(name, url, group) {
  const isAd = adKeywords.some(word => name.includes(word) || group.includes(word));
  const invalidUrl = !url.startsWith("http");
  if (isAd || invalidUrl) return;
  rawChannels.push({ name, url, group });
}

async function fetchSource(sourceUrl) {
  console.log(`\n=====正在读取源：${sourceUrl}=====`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT);
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.log(`❌访问失败，状态码:${res.status}`);
      return;
    }
    const content = await res.text();
    console.log(`✅读取成功，文件长度：${content.length}`);
    const lines = content.split(/\r?\n/);
    let nowGroup = "未分组";
    let channelName = "未知频道";
    for (const line of lines) {
      const rawLine = line.trim();
      if (!rawLine) continue;
      if (rawLine.startsWith("#EXTINF:")) {
        const gMatch = rawLine.match(/group-title="([^"]+)"/);
        if (gMatch) nowGroup = gMatch[1].trim();
        const nMatch = rawLine.match(/,(.*)$/);
        if (nMatch && nMatch[1].trim()) {
          channelName = nMatch[1].trim();
        } else {
          channelName = "未知频道";
        }
        continue;
      }
      if (rawLine.endsWith(",#genre#")) {
        nowGroup = rawLine.split(',')[0].trim();
        channelName = "未知频道";
        continue;
      }
      if (rawLine.includes(',') && !rawLine.startsWith("#")) {
        const parts = rawLine.split(',');
        const cName = parts[0].trim() || "未知频道";
        const cUrl = parts[1].trim();
        pushChannel(cName, cUrl, nowGroup);
        continue;
      }
      if (rawLine.startsWith("http")) {
        pushChannel(channelName, rawLine, nowGroup);
      }
    }
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      console.error(`⏱️读取超时：${sourceUrl}`);
    } else {
      console.error(`❌读取源出错：${sourceUrl}，${err.message}`);
    }
  }
}

// 测速函数，返回延迟ms，失败返回Infinity
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
    if (resp.ok) {
      return Date.now() - start;
    } else {
      return Infinity;
    }
  } catch (_e) {
    clearTimeout(t);
    return Infinity;
  }
}

// 限速并发执行
async function batchTest(list, concurrency) {
  const result = [];
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      const item = list[idx++];
      const delay = await testUrl(item.url);
      result.push({ ...item, delay });
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return result;
}

async function run() {
  // 1.拉取全部源
  for (const s of SOURCE_LIST) {
    await fetchSource(s.url);
  }
  console.log(`\n📥原始收集频道总数：${rawChannels.length}`);

  // 2.去重：同一个name下，url不重复
  const map = new Map();
  for (const ch of rawChannels) {
    if (!map.has(ch.name)) map.set(ch.name, []);
    const arr = map.get(ch.name);
    if (!arr.find(x => x.url === ch.url)) {
      arr.push({ url: ch.url, group: ch.group });
    }
  }
  // 展平回数组
  let dedup = [];
  for (const [name, arr] of map.entries()) {
    for (const it of arr) {
      dedup.push({ name, url: it.url, group: it.group });
    }
  }
  console.log(`✨去重后待测速数量：${dedup.length}`);

  // 3.批量测速
  console.log(`🚀开始测速，并发${CONCURRENCY}，超时${TEST_TIMEOUT/1000}秒`);
  const tested = await batchTest(dedup, CONCURRENCY);

  // 过滤掉测速失败 Infinity，并且按延迟从小到大排序（快的排前面）
  const okList = tested.filter(x => x.delay !== Infinity);
  console.log(`✅测速可用链接：${okList.length}`);

  // 按分组整理，同分组内：同一个频道，延迟小(快)排在前面
  const groupMap = new Map();
  for (const ch of okList) {
    const g = ch.group || "未分组";
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g).push(ch);
  }
  // 每个分组内部，按频道名字分组，同频道按延迟升序
  let outTxt = [];
  let outM3u = ['#EXTM3U'];
  for (const [gName, items] of groupMap) {
    outTxt.push(`${gName},#genre#\n`);
    // 组内按频道名聚合
    const nameGroup = new Map();
    for (const i of items) {
      if (!nameGroup.has(i.name)) nameGroup.set(i.name, []);
      nameGroup.get(i.name).push(i);
    }
    // 每个频道内部按延迟从小到大排序，快的放最上面
    for (const [n, sub] of nameGroup) {
      sub.sort((a, b) => a.delay - b.delay);
      for (const s of sub) {
        outTxt.push(`${n},${s.url}\n`);
        outM3u.push(`#EXTINF:-1 group-title="${gName}",${n}`);
        outM3u.push(s.url);
      }
    }
  }

  fs.writeFileSync("./live.txt", outTxt.join(""), "utf8");
  fs.writeFileSync("./live.m3u", outM3u.join("\n"), "utf8");
  console.log("\n🎉完成！输出 live.txt 与 live.m3u");
  console.log(`可用频道链接数：${okList.length}`);
}

run().catch(e=>console.error(e));
