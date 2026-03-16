export interface Template {
  id: string;
  label: string;
  desc: string;
  html: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    label: "Blank Canvas",
    desc: "Start from nothing",
    html: "",
  },
  {
    id: "particles",
    label: "Particle Field",
    desc: "Drifting particles",
    html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}body{background:#FBF8EF;overflow:hidden}</style></head><body><canvas id="c"></canvas><script>try{const c=document.getElementById('c'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const pts=Array.from({length:60},()=>({x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:Math.random()*2+1,o:Math.random()*.3+.1}));function draw(){x.fillStyle='#FBF8EF';x.fillRect(0,0,c.width,c.height);pts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>c.width)p.vx*=-1;if(p.y<0||p.y>c.height)p.vy*=-1;x.beginPath();x.arc(p.x,p.y,p.r,0,Math.PI*2);x.fillStyle='rgba(26,26,26,'+p.o+')';x.fill()});requestAnimationFrame(draw)}draw()}catch(e){}</script></body></html>`,
  },
  {
    id: "dotgrid",
    label: "Dot Grid",
    desc: "Breathing grid of dots",
    html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}body{background:#FBF8EF;overflow:hidden}</style></head><body><canvas id="c"></canvas><script>try{const c=document.getElementById('c'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const sp=40,cols=Math.ceil(c.width/sp),rows=Math.ceil(c.height/sp);let t=0;function draw(){x.fillStyle='#FBF8EF';x.fillRect(0,0,c.width,c.height);for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const cx=i*sp+sp/2,cy=j*sp+sp/2;const d=Math.sqrt((cx-c.width/2)**2+(cy-c.height/2)**2);const s=Math.sin(t*.02+d*.01)*1.5+2.5;const o=Math.sin(t*.015+d*.008)*.15+.2;x.beginPath();x.arc(cx,cy,s,0,Math.PI*2);x.fillStyle='rgba(26,26,26,'+o+')';x.fill()}t++;requestAnimationFrame(draw)}draw()}catch(e){}</script></body></html>`,
  },
  {
    id: "waveform",
    label: "Waveform",
    desc: "Undulating sine wave",
    html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}body{background:#FBF8EF;overflow:hidden}</style></head><body><canvas id="c"></canvas><script>try{const c=document.getElementById('c'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;let t=0;function draw(){x.fillStyle='#FBF8EF';x.fillRect(0,0,c.width,c.height);for(let w=0;w<3;w++){x.beginPath();const off=w*0.8,op=.12-.03*w;for(let i=0;i<=c.width;i+=2){const y=c.height/2+Math.sin(i*.008+t*.02+off)*80+Math.sin(i*.003+t*.01+off)*40;if(i===0)x.moveTo(i,y);else x.lineTo(i,y)}x.strokeStyle='rgba(26,26,26,'+op+')';x.lineWidth=1.5;x.stroke()}t++;requestAnimationFrame(draw)}draw()}catch(e){}</script></body></html>`,
  },
  {
    id: "circle",
    label: "Breathing Circle",
    desc: "Pulsing concentric rings",
    html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}body{background:#FBF8EF;overflow:hidden}</style></head><body><canvas id="c"></canvas><script>try{const c=document.getElementById('c'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;let t=0;function draw(){x.fillStyle='#FBF8EF';x.fillRect(0,0,c.width,c.height);const cx=c.width/2,cy=c.height/2;for(let i=5;i>=0;i--){const base=30+i*35;const r=base+Math.sin(t*.02+i*.5)*12;const o=.06+(.04*(5-i));x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.strokeStyle='rgba(26,26,26,'+o+')';x.lineWidth=1;x.stroke()}t++;requestAnimationFrame(draw)}draw()}catch(e){}</script></body></html>`,
  },
  {
    id: "constellation",
    label: "Constellation",
    desc: "Connected drifting stars",
    html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}body{background:#FBF8EF;overflow:hidden}</style></head><body><canvas id="c"></canvas><script>try{const c=document.getElementById('c'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const N=30,pts=Array.from({length:N},()=>({x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-.5)*.2,vy:(Math.random()-.5)*.2}));function draw(){x.fillStyle='#FBF8EF';x.fillRect(0,0,c.width,c.height);pts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>c.width)p.vx*=-1;if(p.y<0||p.y>c.height)p.vy*=-1});for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){const d=Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y);if(d<150){x.beginPath();x.moveTo(pts[i].x,pts[i].y);x.lineTo(pts[j].x,pts[j].y);x.strokeStyle='rgba(26,26,26,'+(1-d/150)*.1+')';x.stroke()}}pts.forEach(p=>{x.beginPath();x.arc(p.x,p.y,2,0,Math.PI*2);x.fillStyle='rgba(26,26,26,.25)';x.fill()});requestAnimationFrame(draw)}draw()}catch(e){}</script></body></html>`,
  },
];
