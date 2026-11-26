const fetch = require('node-fetch');
const fs = require('fs');

// =========配置区=========
const SOURCE_LIST = [
  {
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/807080747/zv/refs/heads/main/LiveTV_%E5%8F%AF%E6%92%AD%E6%94%BE.m3u"
  },
  {
    url: ""
  },
  {
    url: "http://ke.html-5.me/i/58870.txt"
  },
  {
    url: "https://nb.xymm.de5.net/0ybmli/https://iptv.445569.xyz/live.m3u"
  },
  {
    url: ""
  },
  {
    url: "https://seep.eu.org/https://raw.githubusercontent.com/buhanzhe/webSourceM3U8/refs/heads/main/webview.txt"
  }
];
const GLOBAL_TIMEOUT = 15000;        // 拉取源文件超时
const CHECK_TIMEOUT = 6000;          // 🔴频道检测超时6秒，超过直接删除
const CHECK_PARALLEL = 5;            // 并发检测数量
const adKeywords = ["广告", "购物", "付费", "商城", "游戏推广", "财经广告", "弹窗", "TG频道"];

let channelPool = [];

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
 * 单条链接检测
 * webview://直接放行；http/https 6秒超时丢弃
 */
async function checkUrl(url){
  if(/^webview:\/+/.test(url)) return true;
  if(!/^(http|https):\/+/.test(url)) return false;

  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), CHECK_TIMEOUT);
  try{
    let res = await fetch(url,{
      method:"HEAD",
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal:controller.signal
    });
    clearTimeout(timer);
    if(res.ok) return true;

    // HEAD不支持，降级GET
    const c2 = new AbortController();
    const t2 = setTimeout(()=>c2.abort(),CHECK_TIMEOUT);
    try{
      res = await fetch(url,{
        method:"GET",
        headers:{
          "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        signal:c2.signal
      });
      return res.ok;
    }finally{
      clearTimeout(t2);
      c2.abort();
    }
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
      try{
        const alive = await checkUrl(ch.url);
        if(alive){
          return ch;
        }else{
          console.log(`❌失效丢弃:【${ch.name}】 ${ch.url}`);
          return null;
        }
      }catch(err){
        console.log(`❌检测异常丢弃:【${ch.name}】${ch.url}  err:${err.message}`);
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
        console.log(`❌访问源失败，状态码:${res.status}`);
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

        if (rawLine.endsWith(",#genre#")) {
          nowGroup = rawLine.split(',')[0].trim();
          channelName = "未知频道";
          continue;
        }

        if (rawLine.includes(',') && !rawLine.startsWith("#")) {
          const parts = rawLine.split(',');
          const cName = parts[0].trim() || "未知频道";
          const cUrl = parts.slice(1).join(',').trim();
          pushChannel(cName, cUrl, nowGroup);
          continue;
        }

        if (/(http|https|webview):\/+/.test(rawLine)) {
          const urlMatch = rawLine.match(/((http|https|webview):\/+\S+)/);
          if(urlMatch){
            pushChannel(channelName, urlMatch[1].trim(), nowGroup);
          }
        }
      }
    } catch (err) {
      console.error(`❌读取源出错：${sourceUrl}，${err.message}`);
      continue;
    }
  }

  console.log(`\n📦一共收集到 ${channelPool.length} 条频道，开始有效性检测（超时${CHECK_TIMEOUT/1000}秒丢弃）`);
  const validChannels = await batchCheck(channelPool, CHECK_PARALLEL);
  console.log(`✅检测完成，存活频道：${validChannels.length}`);

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
  const now = new Date().toLocaleString('zh-CN');
  finalText += `\n# 更新时间:${now}\n`;

  fs.writeFileSync("./live.txt", finalText, "utf8");
  console.log("\n✅全部处理完成！输出 live.txt，总行数：",finalText.split('\n').length);
  // ✅正常跑完强制返回成功码0
  process.exit(0);
}

run().catch(e=>{
  console.error("❌脚本整体异常：",e);
  // 兜底：就算报错，只要生成了live.txt，也尽量返回成功，不阻断提交
  if(fs.existsSync("./live.txt")){
    console.log("⚠️存在live.txt，继续执行提交流程");
    process.exit(0);
  }else{
    process.exit(1);
  }
});
