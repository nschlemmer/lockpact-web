import puppeteer from 'puppeteer-core';
const [url]=process.argv.slice(2);
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1280,height:900}); await p.goto(url,{waitUntil:'networkidle0'});
const r=await p.evaluate(()=>{const hs=[...document.querySelectorAll('article h2')]; const out=[]; for(let i=0;i<hs.length;i++){const a=hs[i].getBoundingClientRect().top+scrollY; const n=hs[i+1]?hs[i+1].getBoundingClientRect().top+scrollY:document.querySelector('article').getBoundingClientRect().bottom+scrollY; out.push([Math.round(n-a),hs[i].textContent.slice(0,60)]);} return out;});
r.forEach(x=>console.log(String(x[0]).padStart(5),x[1])); await b.close();
