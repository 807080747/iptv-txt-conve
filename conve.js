const fetch = require('node-fetch');
const fs = require('fs');

// =========在这里添加所有源，txt、m3u都支持=========
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

const GLOBAL_TIMEOUT = 15000;    // 拉取源超时毫秒
const TEST_TIMEOUT = 3000;        // 单链接测速超时毫秒
const CONCURRENCY = 12;           // 测速并发数
// 广告关键词
const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道"];

let rawChannels = [];

// 频道入池
function pushChannel(name, url, group) {
  const isAd = adKeywords.some(word => name.includes(word) || group.includes(word));
  const invalidUrl = !url.startsWith("http");
  if (isAd || invalidUrl) return;
  rawChannels.push({ name, url, group });
}

// 读取远程源
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
      // M3U #EXTINF 行
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
      // TXT分组标记 xxx,#genre#
      if (rawLine.endsWith(",#genre#")) {
        nowGroup = rawLine.split(',')[0].trim();
        channelName = "未知频道";
        continue;
      }
      // TXT格式：频道名,url
      if (rawLine.includes(',') && !rawLine.startsWith("#")) {
        const parts = rawLine.split(',');
        const cName = parts[0].trim() || "未知频道";
        const cUrl = parts[1].trim();
        pushChannel(cName, cUrl, nowGroup);
        continue;
      }
      // M3U 播放链接 http行
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

// 测速：返回true=可访问；false=打不开
async function testUrl(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TEST_TIMEOUT);
  try {
    const resp = await fetch(url, {
      signal: ctl.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      method: "HEAD"
    });
    clearTimeout(t);
    return resp.ok;
  } catch (_) {
    clearTimeout(t);
    return false;
  }
}

// 并发批量测速
async function batchTest(list, concurrency) {
  const okList = [];
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      const item = list[idx++];
      const ok = await testUrl(item.url);
      if (ok) okList.push(item);
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return okList;
}

async function run() {
  // 1.拉取全部源
  for (const s of SOURCE_LIST) {
    await fetchSource(s.url);
  }
  console.log(`\n📥解析得到频道总数：${rawChannels.length}`);

  // 2.测速，仅保留能打开的链接，打不开直接丢弃
  const validChannels = await batchTest(rawChannels, CONCURRENCY);
  console.log(`✅测速存活频道数：${validChannels.length}`);

  // 3.按分组输出 live.txt
  const groupMap = new Map();
  for (const ch of validChannels) {
    const g = ch.group || "未分组";
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g).push(ch);
  }

  let output = [];
  for (const [gName, items] of groupMap) {
    output.push(`${gName},#genre#`);
    for (const it of items) {
      output.push(`${it.name},${it.url}`);
    }
  }

  fs.writeFileSync("./live.txt", output.join("\n"), "utf8");
  console.log("\n✅处理完成！已输出 live.txt，打不开链接全部删除");
}

run().catch(e => console.error(e));
