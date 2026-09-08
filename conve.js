const fetch = require('node-fetch');

// 在这里添加你的源，支持 txt 和 m3u
const SOURCE_LIST = [
  "https://wget.la/https://raw.githubusercontent.com/Supprise0901/TVBox_live/main/live.txt",
  "https://a.zbbs.eu.org/https://live.445569.xyz/live.m3u"
];

// 广告关键词
const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道"];

async function run() {
  let totalOutput = "";
  let ungroupedChannels = [];
  const groupDone = new Set();

  for (const sourceUrl of SOURCE_LIST) {
    console.log(`正在读取源: ${sourceUrl}`);
    try {
      const res = await fetch(sourceUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 8000
      });
      if (!res.ok) {
        console.log(`源访问失败，跳过: ${sourceUrl}`);
        continue;
      }
      const content = await res.text();
      const lines = content.split('\n');

      let nowGroup = "未分组";
      let channelName = "";

      for (const line of lines) {
        const rawLine = line.trim();
        if (!rawLine) continue;

        // 情况1：M3U标签 #EXTINF
        if (rawLine.startsWith("#EXTINF:")) {
          // 提取分组 group-title
          const gMatch = rawLine.match(/group-title="([^"]+)"/);
          if (gMatch) nowGroup = gMatch[1].trim();
          // 提取频道名称
          const nMatch = rawLine.match(/,(.*)$/);
          if (nMatch) channelName = nMatch[1].trim();
          continue;
        }

        // 情况2：txt格式分组标记 xxx,#genre#
        if (rawLine.endsWith(",#genre#")) {
          nowGroup = rawLine.split(',')[0].trim();
          continue;
        }

        // 情况3：txt格式 频道名,url
        if (rawLine.includes(',') && !rawLine.startsWith('#')) {
          const parts = rawLine.split(',');
          channelName = parts[0].trim();
          const streamUrl = parts[1].trim();
          await pushChannel(channelName, streamUrl, nowGroup);
          continue;
        }

        // 情况4：http直播链接（M3U的url行）
        if (rawLine.startsWith("http")) {
          const streamUrl = rawLine.trim();
          await pushChannel(channelName, streamUrl, nowGroup);
        }
      }
    } catch (err) {
      console.error(`读取源异常跳过：${sourceUrl}，错误：${err.message}`);
    }
  }

  // 所有源处理完毕，追加未分组频道到末尾
  totalOutput += ungroupedChannels.join("");

  const fs = require('fs');
  fs.writeFileSync("./live.txt", totalOutput, "utf8");
  console.log("✅ 全部源处理完成！");

  // 频道写入函数（统一过滤逻辑）
  async function pushChannel(name, url, group) {
    // 过滤规则
    const isAd = adKeywords.some(word => name.includes(word));
    const emptyName = !name;
    const invalidUrl = !url.startsWith("http");
    if (isAd || emptyName || invalidUrl) return;

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
