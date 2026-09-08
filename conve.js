const fetch = require('node-fetch');

const M3U_SOURCE = "https://wget.la/https://raw.githubusercontent.com/Supprise0901/TVBox_live/main/live.txt";

// 广告关键词列表，命中直接整组跳过
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
    let lines = content.split('\n');
    let nowGroup = "未分组";
    let channelName = "";
    const groupDone = new Set();

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // txt格式一般：频道名,url
      if (line.includes(',')) {
        const parts = line.split(',');
        channelName = parts[0].trim();
        const streamUrl = parts[1].trim();

        // 广告过滤
        let isAd = adKeywords.some(word => channelName.includes(word));
        if (isAd) continue;

        if (!groupDone.has(nowGroup)) {
          output += `${nowGroup},#genre#\n`;
          groupDone.add(nowGroup);
        }
        output += `${channelName},${streamUrl}\n`;
      }
    }

    const fs = require('fs');
    fs.writeFileSync("./live.txt", output, "utf8");
    console.log("处理完成，广告已过滤");
  } catch (e) {
    console.error("报错：", e.message);
    process.exit(1);
  }
}

run();
