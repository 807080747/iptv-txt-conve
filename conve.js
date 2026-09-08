const fetch = require('node-fetch');

const SOURCE_LIST = [
  "https://wget.la/https://raw.githubusercontent.com/Supprise0901/TVBox_live/main/live.txt",
  // 该源在GitHub Actions大概率网络被拦截
  "https://live.445569.xyz/live.m3u"
];

const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道"];

async function run() {
  let totalOutput = "";
  let ungroupedChannels = [];
  const groupDone = new Set();

  for (const sourceUrl of SOURCE_LIST) {
    console.log(`\n=====正在读取源：${sourceUrl}=====`);
    try {
      const res = await fetch(sourceUrl, {
        headers: { "User‑Agent": "Mozilla/5.0", "Accept":"*/*" },
        timeout:12000
      });
      if (!res.ok) {
        console.log(`❌【访问失败】HTTP状态码:${res.status}`);
        continue;
      }
      const content = await res.text();
      console.log(`✅【读取成功】返回文本长度：${content.length}`);
      const lines = content.split('\n');

      let nowGroup = "未分组";
      let channelName = "未知频道";
      let parseCount = 0;

      for (const line of lines) {
        const rawLine = line.trim();
        if (!rawLine) continue;

        if (rawLine.startsWith("#EXTINF:")) {
          const gMatch = rawLine.match(/group‑title="([^"]+)"/);
          if(gMatch) nowGroup = gMatch[1].trim();
          const nMatch = rawLine.match(/,(.*)$/);
          if(nMatch && nMatch[1].trim()){
            channelName = nMatch[1].trim();
          }else{
            channelName = "未知频道";
          }
          continue;
        }

        if (rawLine.endsWith(",#genre#")) {
          nowGroup = rawLine.split(',')[0].trim();
          channelName = "未知频道";
          continue;
        }

        if(rawLine.includes(',') && !rawLine.startsWith("#")){
          const parts = rawLine.split(',');
          const cName = parts[0].trim()||"未知频道";
          const cUrl = parts[1].trim();
          pushChannel(cName,cUrl,nowGroup);
          parseCount++;
          continue;
        }

        if(rawLine.startsWith("http")){
          pushChannel(channelName, rawLine, nowGroup);
          parseCount++;
        }
      }
      console.log(`ℹ️本源解析得到频道数量:${parseCount}`);
    } catch (err) {
      console.error(`❌【网络异常】读取源失败，错误信息：${err.message}`);
    }
  }

  totalOutput += ungroupedChannels.join("");

  const fs = require('fs');
  fs.writeFileSync("./live.txt", totalOutput, "utf‑8");
  console.log("\n✅全部任务执行完毕");

  function pushChannel(name, url, group) {
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
