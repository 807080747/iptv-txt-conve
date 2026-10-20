const fetch = require('node-fetch');
const fs = require('fs');

// =========在这里添加所有源，txt、m3u都支持=========
const SOURCE_LIST = [
  {
    url: "https://seep.eu.org/https://jh.807080747.workers.dev/"
  },
  {
    url: "https://seep.eu.org/https://iptv.445569.xyz/live.m3u"
  }
];
// 全局统一超时：15秒
const GLOBAL_TIMEOUT = 15000;

// 广告关键词
const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道"];

// 频道处理函数（过滤+分组归类）
function pushChannel(name, url, group, totalOutput, ungroupedChannels, groupDone) {
  // 修复：同时判断【频道名】和【分组名】是否含广告关键词
  const isAd = adKeywords.some(word => name.includes(word) || group.includes(word));
  const invalidUrl = !url.startsWith("http");
  if (isAd || invalidUrl) return;

  if (group === "未分组") {
    ungroupedChannels.push(`${name},${url}\n`);
  } else {
    if (!groupDone.has(group)) {
      totalOutput.push(`${group},#genre#\n`);
      groupDone.add(group);
    }
    totalOutput.push(`${name},${url}\n`);
  }
}

async function run() {
  let totalOutput = [];
  let ungroupedChannels = [];
  const groupDone = new Set();

  for (const source of SOURCE_LIST) {
    const sourceUrl = source.url;
    console.log(`\n=====正在读取源：${sourceUrl}=====`);
    console.log(`⏱️全局超时设置：${GLOBAL_TIMEOUT/1000}秒`);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT);

      const res = await fetch(sourceUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          // ✅关闭客户端缓存，强制拉取最新内容（URL不变，不会大量消耗CF流量）
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.log(`❌访问失败，状态码:${res.status}`);
        continue;
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
          pushChannel(cName, cUrl, nowGroup, totalOutput, ungroupedChannels, groupDone);
          continue;
        }

        // M3U 播放链接 http行
        if (rawLine.startsWith("http")) {
          pushChannel(channelName, rawLine, nowGroup, totalOutput, ungroupedChannels, groupDone);
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.error(`⏱️读取超时：${sourceUrl}，超过设定时间`);
      } else {
        console.error(`❌读取源出错：${sourceUrl}，${err.message}`);
      }
    }
  }

  // 拼接全部文本
  let finalText = totalOutput.join("");
  finalText += ungroupedChannels.join("");

  fs.writeFileSync("./live.txt", finalText, "utf8");
  console.log("\n✅全部源处理完成！输出 live.txt");
}

run();
