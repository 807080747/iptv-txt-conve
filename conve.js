const fetch = require('node-fetch');
const fs = require('fs');

// =========配置区=========
const SOURCE_LIST = [
  {
    url: "https://cnb.cool/fingersc/iptv-sync/-/git/raw/main/user_result.txt"
  },
  {
    url: "https://seep.eu.org/https://raw.githubusercontent.com/buhanzhe/webSourceM3U8/refs/heads/main/webview.txt"
  },
  {
    url: "https://seep.eu.org/https://raw.githubusercontent.com/lem85930/LiteTV/refs/heads/main/live.m3u"
  },
  {
    url: "https://gh-proxy.com/https://raw.githubusercontent.com/807080747/IPT/refs/heads/main/live.txt"
  },
  {
    url: "https://cnb.cool/kingmax1688/iptv/-/git/raw/main/output/iptv.txt"
  },
  {
    url: "https://nb.xymm.de5.net/0ybmli/https://iptv.445569.xyz/live.m3u"
  }
];
const GLOBAL_TIMEOUT = 15000;        // 拉取源文件超时
const CHECK_TIMEOUT = 6000;          // 🔴频道检测超时6秒，超过直接删除
const CHECK_PARALLEL = 5;            // 🔴同时检测并发数量，不要调太大，防止action被封
const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道"];

// 频道池，先全部存入内存，之后批量检测
let channelPool = [];

// 原始收集，不再直接写入输出，先放入池子
function pushChannel(name, url, group) {
  if(!name || !url) return;
  const isAd = adKeywords.some(word => name.includes(word) || group.includes(word));
  if (isAd) return;
  name = name.trim();
  url = url.trim();
  group = group.trim() || "未分组";
  channelPool.push({name,url,group});
}

/**
 * 单条链接检测函数
 * webview:// 直接返回true放行
 * http/https：6秒超时检测，成功true，超时/网络错误返回false
 */
async function checkUrl(url){
  if(/^webview:\/+/.test(url)) return true;
  if(!/^(http|https):\/+/.test(url)) return false;

  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), CHECK_TIMEOUT);
  try{
    // 优先HEAD，省流量
    let res = await fetch(url,{
      method:"HEAD",
      headers:{
        "User‑Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal:controller.signal
    });
    clearTimeout(timer);
    if(res.ok) return true;

    // HEAD 405不支持，降级GET，只取响应头立刻断开
    const c2 = new AbortController();
    const t2 = setTimeout(()=>c2.abort(),CHECK_TIMEOUT);
    res = await fetch(url,{
      method:"GET",
      headers:{
        "User‑Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal:c2.signal
    });
    t2 && clearTimeout(t2);
    c2.abort();
    return res.ok;
  }catch(e){
    clearTimeout(timer);
    return false;
  }
}

// 分批并发检测
async function batchCheck(list, parallel){
  const okList = [];
  for(let i=0;i<list.length;i += parallel){
    const slice = list.slice(i,i+parallel);
    console.log(`\n🔍正在检测频道 ${i+1} ~ ${i+slice.length} / ${list.length}`);
    const tasks = slice.map(async ch=>{
      const alive = await checkUrl(ch.url);
      if(alive){
        return ch;
      }else{
        console.log(`❌失效丢弃:【${ch.name}】 ${ch.url}`);
        return null;
      }
    });
    const result = await Promise.all(tasks);
    okList.push(...result.filter(x=>x!==null));
  }
  return okList;
}

async function run() {
  channelPool = [];
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
          const inlineUrlMatch = rawLine.match(/(webview?:\/+\S+)/);
          if(inlineUrlMatch){
            pushChannel(channelName, inlineUrlMatch[1].trim(), nowGroup);
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
          pushChannel(cName, cUrl, nowGroup);
          continue;
        }

        // m3u链接行
        if (/(http|https|webview):\/+/.test(rawLine)) {
          const urlMatch = rawLine.match(/((http|https|webview):\/+\S+)/);
          if(urlMatch){
            pushChannel(channelName, urlMatch[1].trim(), nowGroup);
          }
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

  console.log(`\n📦一共收集到 ${channelPool.length} 条频道，开始有效性检测（超时${CHECK_TIMEOUT/1000}秒丢弃）`);
  const validChannels = await batchCheck(channelPool, CHECK_PARALLEL);
  console.log(`✅检测完成，存活频道：${validChannels.length}`);

  // 分组整理输出
  const totalOutput = [];
  const ungroupedChannels = [];
  const groupDone = new Set();
  for(const ch of validChannels){
    const {name,url,group} = ch;
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

  let finalText = totalOutput.join("");
  finalText += ungroupedChannels.join("");

  if(!finalText.trim()){
    console.warn("⚠️警告：没有获取到任何有效频道！");
    finalText = "";
  }
  // 追加更新时间注释，强制文件每次变更
  const now = new Date().toLocaleString('zh‑CN');
  finalText += `\n# 更新时间:${now}\n`;

  fs.writeFileSync("./live.txt", finalText, "utf8");
  console.log("\n✅全部处理完成！输出 live.txt，总行数：",finalText.split('\n').length);
}

run().catch(e=>{
  console.error("脚本整体异常终止：",e);
  process.exit(1);
});
