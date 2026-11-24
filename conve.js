const fetch = require('node-fetch');
const fs = require('fs');

// =========在这里添加所有源，txt、m3u都支持=========
const SOURCE_LIST = [
  {
    url: "https://seep.eu.org/https://xxyumenga04.807080747.workers.dev/"
  },
  {
    url: "https://seep.eu.org/https://raw.githubusercontent.com/buhanzhe/webSourceM3U8/refs/heads/main/webview.txt"
  },
  {
    url: "http://iptv.910501.xyz/"
  },
  {
    url: "https://gh-proxy.com/https://raw.githubusercontent.com/807080747/Collect-IPTV/refs/heads/main/best_sorted.m3u"
  },
  {
    url: "https://nb.xymm.de5.net/0ybmli/https://iptv.445569.xyz/live.m3u"
  }
];
// 全局统一超时：15秒
const GLOBAL_TIMEOUT = 15000;
// 广告关键词
const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道"];

// 频道处理函数（过滤+分组归类，已移除http链接校验）
function pushChannel(name, url, group, totalOutput, ungroupedChannels, groupDone) {
  if(!name || !url) return;
  const isAd = adKeywords.some(word => name.includes(word) || group.includes(word));
  if (isAd) return;

  name = name.trim();
  url = url.trim();
  group = group.trim() || "未分组";

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
    if(!sourceUrl){
      console.log("跳过空源地址");
      continue;
    }
    console.log(`\n=====正在读取源：${sourceUrl}=====`);
    console.log(`⏱️全局超时设置：${GLOBAL_TIMEOUT/1000}秒`);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT);
      const res = await fetch(sourceUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
          const cUrl = parts.slice(1).join(',').trim();
          pushChannel(cName, cUrl, nowGroup, totalOutput, ungroupedChannels, groupDone);
          continue;
        }
        // ✅支持 http https webview:// 协议链接
        if (/^(http|https|webview):\/\//.test(rawLine)) {
          pushChannel(channelName, rawLine, nowGroup, totalOutput, ungroupedChannels, groupDone);
        }
      }
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        console.error(`⏱️读取超时：${sourceUrl}，超过设定时间`);
      } else {
        console.error(`❌读取源出错：${sourceUrl}，${err.message}`);
      }
      continue;
    }
  }

  let finalText = totalOutput.join("");
  finalText += ungroupedChannels.join("");

  if(!finalText.trim()){
    console.warn("⚠️警告：没有获取到任何有效频道！");
    finalText = "";
  }
  fs.writeFileSync("./live.txt", finalText, "utf8");
  console.log("\n✅全部源处理完成！输出 live.txt，总行数：",finalText.split('\n').length);
}

run().catch(e=>{
  console.error("脚本整体异常终止：",e);
  process.exit(1);
});
