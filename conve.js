const fetch = require('node-fetch');

// 改成你的远程TXT链接 / m3u链接都行
const M3U_SOURCE = "https://live.445569.xyz/live.m3u";

async function run() {
  try {
    const res = await fetch(M3U_SOURCE, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 8000
    });
    if (!res.ok) throw new Error(`源访问失败 ${res.status}`);
    const content = await res.text();

    let output = "";
    // 如果是txt后缀，直接原样保存
    if (M3U_SOURCE.endsWith('.txt')) {
      output = content;
    } else {
      // m3u 原有转换逻辑不变
      let lines = content.split('\n');
      let nowGroup = "未分组";
      let channelName = "";
      const groupDone = new Set();

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith("#EXTM3U") || line.startsWith("#EXTVLCOPT")) continue;
        if (line.startsWith("#EXTINF:")) {
          const gMatch = line.match(/group-title="([^"]+)"/);
          if (gMatch) nowGroup = gMatch[1];
          const nMatch = line.match(/,(.*)$/);
          if (nMatch) channelName = nMatch[1].trim();
          continue;
        }
        if (line.startsWith("http")) {
          if (!groupDone.has(nowGroup)) {
            output += `${nowGroup},#genre#\n`;
            groupDone.add(nowGroup);
          }
          const name = channelName || "未知频道";
          output += `${name},${line}\n`;
        }
      }
    }

    const fs = require('fs');
    fs.writeFileSync("./live.txt", output, "utf8");
    console.log("处理完成");
  } catch (e) {
    console.error("报错：", e.message);
    process.exit(1);
  }
}

run();
