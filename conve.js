const fetch = require('node-fetch');

// 多个源在这里添加，一行一个
const M3U_SOURCE_LIST = [
  "https://wget.la/https://raw.githubusercontent.com/Supprise0901/TVBox_live/main/live.txt",
  // 在这里继续新增其他txt源，示例：
  // "https://a.zbbs.eu.org/https://live.445569.xyz/live.m3u",
  // "https://xxx/live3.txt"
];

// 广告关键词列表，命中直接跳过
const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道"];

async function run() {
  let totalOutput = "";
  let ungroupedChannels = [];
  const groupDone = new Set();

  // 循环拉取每一个源
  for (const sourceUrl of M3U_SOURCE_LIST) {
    console.log(`正在拉取源：${sourceUrl}`);
    try {
      const res = await fetch(sourceUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 8000
      });
      if (!res.ok) {
        console.log(`源访问失败，跳过：${sourceUrl}`);
        continue;
      }
      const content = await res.text();
      let lines = content.split('\n');
      let nowGroup = "未分组";

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // 识别分组标记：xxx,#genre#
        if (line.endsWith(",#genre#")) {
          nowGroup = line.split(',')[0].trim();
          continue;
        }

        // 标准格式：频道名,url
        if (line.includes(',')) {
          const parts = line.split(',');
          const channelName = parts[0].trim();
          const streamUrl = parts[1].trim();

          // 过滤规则
          const isAd = adKeywords.some(word => channelName.includes(word));
          const emptyName = !channelName;
          const invalidUrl = !streamUrl.startsWith("http");

          if (isAd || emptyName || invalidUrl) {
            continue;
          }

          if (nowGroup === "未分组") {
            // 未分组频道单独存放，最后追加
            ungroupedChannels.push(`${channelName},${streamUrl}\n`);
          } else {
            // 正常分组频道写入
            if (!groupDone.has(nowGroup)) {
              totalOutput += `${nowGroup},#genre#\n`;
              groupDone.add(nowGroup);
            }
            totalOutput += `${channelName},${streamUrl}\n`;
          }
        }
      }
    } catch (err) {
      console.error(`读取源出错跳过：${sourceUrl}，错误：${err.message}`);
    }
  }

  // 所有源读取完成，把未分组频道追加到最后
  totalOutput += ungroupedChannels.join("");

  const fs = require('fs');
  fs.writeFileSync("./live.txt", totalOutput, "utf8");
  console.log("✅全部源处理完成，合并成功！");
}

run();
