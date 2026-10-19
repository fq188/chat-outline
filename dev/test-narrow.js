const fs=require('fs'),path=require('path');
const { loadChromium, launchOptions } = require('./_browser');
const chromium = loadChromium();
const EXT=path.resolve(__dirname, '..');
(async()=>{
  const b=await chromium.launch({ ...launchOptions(), headless: true });
  for (const [w,h,tag] of [[647,352,'narrow'],[1280,620,'mid'],[1600,900,'wide']]) {
    const p=await b.newPage({viewport:{width:w,height:h}});
    const html=fs.readFileSync(path.join(__dirname,'mock.html'),'utf8');
    await p.route('https://chatgpt.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
    await p.addInitScript({content:fs.readFileSync(path.join(EXT,'content.js'),'utf8')});
    await p.goto('https://chatgpt.com/c/x',{waitUntil:'domcontentloaded'});
    await p.waitForTimeout(900);
    const box=await p.evaluate(()=>{
      const sr=document.getElementById('chat-outline-host').shadowRoot;
      const r=sr.querySelector('.panel').getBoundingClientRect();
      return {w:Math.round(r.width),h:Math.round(r.height),count:sr.querySelector('.count').textContent,
              visibleItems:[...sr.querySelectorAll('.item')].length};
    });
    console.log(`${tag} ${w}x${h} -> panel ${box.w}x${box.h}  (占宽 ${Math.round(box.w/w*100)}%)  条目 ${box.visibleItems}  count ${box.count}`);
    await p.screenshot({path:`shots/30-${tag}.png`});
    await p.close();
  }
  await b.close();
})();
