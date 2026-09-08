const fetch = require('node-fetch');

const M3U_SOURCE = "https://wget.la/https://raw.githubusercontent.com/Supprise0901/TVBox_live/main/live.txt";

// 广告关键词列表，命中直接跳过
const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道"];

async function run() {
  try {
    const res = await fetch(M3U_SOURCE, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 8000
    });
    if (!res.ok) throw new Error(`源访问失败 ${res.status}`);
    const content = await res.text();

    let output = "";
    let ungroupedChannels = []; // 单独存放未分组频道
    let lines = content.split('\n');
    let nowGroup = "未分组";
    const groupDone = new Set();

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
          // 未分组频道，放进数组暂存，不直接写入output
          ungroupedChannels.push(`${channelName},${streamUrl}\n`);
        } else {
          // 正常分组频道，直接写入
          if (!groupDone.has(nowGroup)) {
            output += `${nowGroup},#genre#\n`;
            groupDone.add(nowGroup);
          }
          output += `${channelName},${streamUrl}\n`;
        }
      }
    }

    // 全部正常分组写完之后，追加所有未分组频道到文件末尾
    output += ungroupedChannels.join("");

    const fs = require('fs');
    fs.writeFileSync("./live.txt", output, "utf8");
    console.log("✅处理完成：正常分组在前，未分组频道放在末尾，无未分组标题");
  } catch (e) {
    console.error("❌报错：", e.message);
    process.exit(1);
  }
}

run();
