const fetch = require('node-fetch');

// 你的M3U源地址，改成你自己的
const M3U_SOURCE = "https://raw.githubusercontent.com/Guovin/iptv-api/gd/output/result.m3u";

async function run() {
  try {
    const res = await fetch(M3U_SOURCE, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 8000
    });
    if (!res.ok) throw new Error(`源访问失败 ${res.status}`);
    const m3uText = await res.text();

    let lines = m3uText.split('\n');
    let output = "";
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

    // 写入txt文件
    const fs = require('fs');
    fs.writeFileSync("./live.txt", output, "utf8");
    console.log("转换完成，已生成 live.txt");
  } catch (e) {
    console.error("转换报错：", e.message);
    process.exit(1);
  }
}

run();
