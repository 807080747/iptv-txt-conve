const fetch = require('node-fetch');
const fs = require('fs');

// =========在这里添加所有源，txt、m3u都支持=========
const SOURCE_LIST = [
  "https://wget.la/https://raw.githubusercontent.com/Supprise0901/TVBox_live/main/live.txt",
  "https://a.zbbs.eu.org/https://live.445569.xyz/live.m3u"
];

// 广告关键词
const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道", "@"];

// 已记录的链接，用于去重
const seenUrlSet = new Set();
let totalCount = 0;
let adFilterCount = 0;
// 【全局】存放广告分组，不要放到循环里面！
const adGroupSet = new Set();

async function run() {
  let totalOutput = "";
  let ungroupedChannels = [];
  const groupDone = new Set();

  for (const sourceUrl of SOURCE_LIST) {
    console.log(`\n=====正在读取源：${sourceUrl}=====`);
    try {
      const res = await fetch(sourceUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 12000
      });
      if (!res.ok) {
        console.log(`❌访问失败，状态码:${res.status}`);
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

        // M3U #EXTINF 行
        if (rawLine.startsWith("#EXTINF:")) {
          const gMatch = rawLine.match(/group-title="([^"]+)"/);
          if (gMatch) {
            nowGroup = gMatch[1].trim();
            // ✅ M3U分组也要检测是否广告分组
            const isGroupAd = adKeywords.some(word => nowGroup.includes(word));
            if (isGroupAd) {
              adGroupSet.add(nowGroup);
              console.log(`⚠️【M3U广告分组】${nowGroup}`);
            }
          }
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
          const isGroupAd = adKeywords.some(word => nowGroup.includes(word));
          if (isGroupAd) {
            adGroupSet.add(nowGroup);
            console.log(`⚠️【TXT广告分组】${nowGroup}`);
          }
          channelName = "未知频道";
          continue;
        }

        // TXT格式：频道名,url
        if (rawLine.includes(',') && !rawLine.startsWith("#")) {
          const parts = rawLine.split(',');
          const cName = parts[0].trim() || "未知频道";
          const cUrl = parts[1].trim();
          pushChannel(cName, cUrl, nowGroup);
          continue;
        }

        // M3U 播放链接 http行
        if (rawLine.startsWith("http")) {
          pushChannel(channelName, rawLine, nowGroup);
        }
      }
    } catch (err) {
      console.error(`❌读取源出错：${sourceUrl}，${err.message}`);
    }
  }

  // 写入【未分组】标题
  if (ungroupedChannels.length > 0) {
    totalOutput += "未分组,#genre#\n";
    totalOutput += ungroupedChannels.join("");
  }

  fs.writeFileSync("./live.txt", totalOutput, "utf8");
  console.log(`\n✅全部源处理完成！`);
  console.log(`📊统计：有效频道 ${totalCount} 个，过滤广告 ${adFilterCount} 个`);
  console.log(`🚫被过滤广告分组：${Array.from(adGroupSet).join(", ")}`);
}

// 频道处理函数（过滤广告 + 链接去重 + 分组归类）
function pushChannel(name, url, group) {
  // 如果当前属于广告分组，直接跳过
  if (adGroupSet.has(group)) return;

  // 广告过滤
  const isAd = adKeywords.some(word => name.includes(word));
  if (isAd) {
    adFilterCount++;
    return;
  }
  // 无效链接过滤
  if (!url.startsWith("http")) return;
  // 链接去重，相同url直接跳过
  if (seenUrlSet.has(url)) return;

  seenUrlSet.add(url);
  totalCount++;

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

run();
