const fetch = require('node-fetch');

// 源列表，支持 m3u / txt
const SOURCE_LIST = [
  "https://wget.la/https://raw.githubusercontent.com/Supprise0901/TVBox_live/main/live.txt",
  "https://live.445569.xyz/live.m3u"
];

// 广告关键词
const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道"];

async function run() {
  let totalOutput = "";
  let ungroupedChannels = [];
  const groupDone = new Set();

  for (const sourceUrl of SOURCE_LIST) {
    console.log(`\n===== 正在读取源: ${sourceUrl} =====`);
    try {
      const res = await fetch(sourceUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "*/*"
        },
        timeout: 12000
      });
      if (!res.ok) {
        console.log(`❌访问失败，状态码: ${res.status}`);
        continue;
      }
      const content = await res.text();
      console.log(`✅读取成功，文件长度：${content.length}`);
      const lines = content.split('\n');

      let nowGroup = "未分组";
      let channelName = "未知频道";

      for (const line of lines) {
        const rawLine = line.trim();
        if (!rawLine) continue;

        // M3U 频道信息行 #EXTINF
        if (rawLine.startsWith("#EXTINF:")) {
          nowGroup = "未分组";
          // 提取分组 group-title="xxx"
          const gMatch = rawLine.match(/group-title="([^"]+)"/);
          if (gMatch) nowGroup = gMatch[1].trim();
          // 提取频道名称，逗号后面就是频道名
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
        if (rawLine.includes(',') && !rawLine.startsWith('#')) {
          const parts = rawLine.split(',');
          channelName = parts[0].trim() || "未知频道";
          const streamUrl = parts[1].trim();
          pushChannel(channelName, streamUrl, nowGroup);
          continue;
        }

        // M3U播放链接（http开头，紧跟#EXTINF后面）
        if (rawLine.startsWith("http")) {
          const streamUrl = rawLine.trim();
          pushChannel(channelName, streamUrl, nowGroup);
        }
      }
    } catch (err) {
      console.error(`❌读取源异常：${sourceUrl}，错误信息：${err.message}`);
    }
  }

  // 所有源处理完成，追加未分组频道到文件末尾
  totalOutput += ungroupedChannels.join("");

  const fs = require('fs');
  fs.writeFileSync("./live.txt", totalOutput, "utf8");
  console.log("\n✅全部源处理完毕！");

  // 频道写入函数
  function pushChannel(name, url, group) {
    // 广告过滤
    const isAd = adKeywords.some(word => name.includes(word));
    const invalidUrl = !url.startsWith("http");
    if (isAd || invalidUrl) return;

    if (group === "未分组") {
      ungroupedChannels.push(`${name},${url}\n`);
    } else {
      if (!groupDone.has(group)) {
        totalOutput += `${group},#genre#\n`;
        groupDone.add(group);
      }
      totalOutput += `${name},${url}\n`;
    }
  }
}

run();
