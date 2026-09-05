import p5 from 'p5';
import './style.css';
import './evening';

type Point = { x: number; y: number };
type Mode = 'bloom' | 'ripple';
type FlowerSpec = {
  x: number; y: number; r: number; angle: number;
  color: string; accent: string; pose: 'open' | 'side' | 'bud'; delay: number;
};
type Petal = { points: Point[]; angle: number; length: number; bend: number };
type Flower = FlowerSpec & { petals: Petal[]; wash: p5.Graphics; size: number; phase: number };

const PAPER = '#f6efe4';
const TAU = Math.PI * 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const rgba = (hex: string, alpha: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
};

// Positions are in bouquet space. Resize changes the projection, not the flowers.
const specs: FlowerSpec[] = [
  {x:-105,y:-151,r:41,angle:-1.92,color:'#bc839d',accent:'#6b7398',pose:'side',delay:2.5},
  {x:41,y:-176,r:56,angle:-1.25,color:'#d8ac3d',accent:'#f4dea0',pose:'side',delay:2.8},
  {x:-59,y:-259,r:23,angle:-1.87,color:'#d16b58',accent:'#eeb799',pose:'bud',delay:4.8},
  {x:100,y:-253,r:22,angle:-1.11,color:'#d6b350',accent:'#ebd59a',pose:'bud',delay:5.2},
  {x:166,y:-150,r:38,angle:-.94,color:'#7c94b9',accent:'#b6a6cc',pose:'side',delay:4.5},
  {x:-163,y:-57,r:55,angle:-2.48,color:'#cb786d',accent:'#e9a788',pose:'side',delay:3.8},
  {x:64,y:-73,r:66,angle:-.91,color:'#ddb946',accent:'#f2df9f',pose:'open',delay:2.1},
  {x:-66,y:-64,r:61,angle:-1.44,color:'#9294bc',accent:'#547dac',pose:'open',delay:1.9},
  {x:153,y:8,r:53,angle:-.48,color:'#b66387',accent:'#e4a4a2',pose:'side',delay:3.7},
  {x:-138,y:75,r:44,angle:-2.63,color:'#aaa1b9',accent:'#81769e',pose:'open',delay:4.2},
  {x:88,y:86,r:50,angle:.21,color:'#829ac1',accent:'#aba6c9',pose:'open',delay:4.3},
  {x:-205,y:28,r:24,angle:-2.45,color:'#9b859f',accent:'#c9afa9',pose:'bud',delay:5.4},
  {x:198,y:100,r:26,angle:-.38,color:'#7592b2',accent:'#c3b7cc',pose:'side',delay:5.6},
  {x:-28,y:115,r:40,angle:-2.13,color:'#cbb46d',accent:'#eddbab',pose:'side',delay:4.6},
  {x:72,y:35,r:49,angle:.25,color:'#ad3e70',accent:'#e99aab',pose:'side',delay:3.1},
  {x:-9,y:4,r:87,angle:-1.73,color:'#d34a32',accent:'#f2a27d',pose:'open',delay:1.6},
];

// Gather the outer flowers around the coral foreground flower.
specs.forEach(flower => {
  flower.x *= .67;
  flower.y *= .49;
  if(flower.r<70)flower.r*=1.14;
  if (flower.color === '#9294bc') { flower.color = '#6872ad'; flower.accent = '#3d649a'; }
  if (flower.color === '#b66387') { flower.color = '#ad3e70'; flower.accent = '#e99aab'; }
  if (flower.color === '#829ac1') { flower.color = '#557cae'; flower.accent = '#9990c0'; }
});

new p5(p => {
  let flowers: Flower[] = [];
  let paper: p5.Graphics;
  let mode: Mode = 'bloom';
  let started = 0;
  let sceneScale = 1;
  let origin: Point = { x: 0, y: 0 };
  let pointer: Point = { x: 0, y: 0 };
  let lean = 0;
  let targetLean = 0;
  let pulse = -100;
  let receivedAt: number | undefined;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function context(g: p5 | p5.Graphics): CanvasRenderingContext2D {
    // SAFETY: All canvases in this sketch use p5's default P2D renderer.
    return g.drawingContext as CanvasRenderingContext2D;
  }

  function trace(ctx: CanvasRenderingContext2D, points: Point[], progress = 1, close = false) {
    const count = Math.floor((points.length - 1) * clamp(progress));
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i <= count; i++) ctx.lineTo(points[i].x, points[i].y);
    if (close) ctx.closePath();
  }

  function makePetal(f: FlowerSpec, index: number): Petal {
    const angle = f.angle + (f.pose === 'open' ? index * TAU / 6 : (index - 2.5) * (f.pose === 'bud' ? .145 : .47)) + p.random(-.07, .07);
    const length = f.r * p.random(1.12, 1.49) * (f.pose === 'bud' ? 1.45 : 1);
    const width = f.r * p.random(.32, .48) * (f.pose === 'bud' ? .39 : 1);
    const bend = f.r * p.random(-.40, .40);
    const points: Point[] = [];
    for (const side of [1, -1]) {
      for (let j = 0; j <= 46; j++) {
        const t = side === 1 ? j / 46 : 1 - j / 46;
        const s = Math.sin(Math.PI * t);
        const u = length * t;
        const v = bend * s + side * width * Math.pow(Math.max(0, s), .83) * (1 - .28 * t) * (1 + .035 * Math.sin(t * 34 + index));
        points.push({x:Math.cos(angle) * u - Math.sin(angle) * v,y:Math.sin(angle) * u + Math.cos(angle) * v});
      }
    }
    return { points, angle, length, bend };
  }

  function paintFlower(spec: FlowerSpec, index: number): Flower {
    const petals = Array.from({length:6}, (_, i) => makePetal(spec, i));
    const size = Math.ceil(spec.r * 4.8);
    const wash = p.createGraphics(size, size);
    wash.pixelDensity(2);
    const ctx = context(wash);
    ctx.translate(size / 2, size / 2);
    // Cache the pigment. The animation reuses these pixels on every frame.
    for (const [i, petal] of petals.entries()) {
      ctx.save();
      trace(ctx, petal.points, 1, true);
      ctx.clip();
      const tx = Math.cos(petal.angle) * petal.length;
      const ty = Math.sin(petal.angle) * petal.length;
      const gradient = ctx.createLinearGradient(0, 0, tx, ty);
      gradient.addColorStop(0, rgba(spec.color, .78));
      gradient.addColorStop(.22, rgba(spec.color, .61));
      gradient.addColorStop(.58, rgba(i % 2 ? spec.accent : spec.color, .36));
      gradient.addColorStop(.86, rgba(spec.accent, .15));
      gradient.addColorStop(1, rgba(spec.accent, .035));
      ctx.fillStyle = gradient;
      ctx.fillRect(-size/2, -size/2, size, size);
      // Irregular translucent deposits produce paper gaps and wet edges.
      for (let layer = 0; layer < 8; layer++) {
        const t = p.random(.16, .78);
        const x = tx * t + p.random(-spec.r*.12, spec.r*.12);
        const y = ty * t + p.random(-spec.r*.12, spec.r*.12);
        ctx.beginPath();
        for (let j = 0; j <= 48; j++) {
          const a = j / 48 * TAU;
          const edge = .78 + p.noise(Math.cos(a)*2+index*4+layer, Math.sin(a)*2+i*5)*.45;
          const u = Math.cos(a)*spec.r*.52*edge;
          const v = Math.sin(a)*spec.r*.3*edge;
          const px = x+u*Math.cos(petal.angle)-v*Math.sin(petal.angle);
          const py = y+u*Math.sin(petal.angle)+v*Math.cos(petal.angle);
          if (j === 0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }
        ctx.closePath();
        ctx.fillStyle = rgba(layer%3 ? spec.color : spec.accent, .047);
        ctx.fill();
        ctx.strokeStyle = rgba(spec.color, .075);
        ctx.lineWidth = .8;
        ctx.stroke();
      }
      for (let dot=0;dot<900;dot++) {
        const x=p.random(-spec.r*1.7,spec.r*1.7), y=p.random(-spec.r*1.7,spec.r*1.7);
        ctx.fillStyle=rgba(dot%3 ? spec.color : '#fff9e9',p.random(.025,.17));
        ctx.fillRect(x,y,p.random(.2,.8),p.random(.2,.8));
      }
      trace(ctx,petal.points,1,true);
      ctx.strokeStyle=rgba(spec.color,.25);
      ctx.lineWidth=1.35;
      ctx.stroke();
      // A darker throat and pale curved channels give each petal depth.
      const throat=ctx.createRadialGradient(0,0,0,0,0,spec.r*.53);
      throat.addColorStop(0,rgba(spec.pose==='open'?'#654036':spec.color,.43));
      throat.addColorStop(.28,rgba(spec.color,.25));
      throat.addColorStop(1,rgba(spec.color,0));
      ctx.fillStyle=throat;ctx.fillRect(-spec.r,-spec.r,spec.r*2,spec.r*2);
      for(let vein=0;vein<4;vein++){
        const offset=(vein-1.5)*.052;
        const a=petal.angle+offset;
        ctx.beginPath();ctx.moveTo(Math.cos(a)*spec.r*.2,Math.sin(a)*spec.r*.2);
        ctx.quadraticCurveTo(tx*.52-Math.sin(a)*petal.bend,ty*.52+Math.cos(a)*petal.bend,tx*.93,ty*.93);
        ctx.strokeStyle=rgba('#fff8df',.13);ctx.lineWidth=1.1+vein*.25;ctx.stroke();
      }
      ctx.restore();
    }
    return {...spec, petals, wash, size, phase:index*1.79};
  }

  function makePaper() {
    paper?.remove();
    paper=p.createGraphics(p.width,p.height);
    paper.pixelDensity(1);
    paper.background(PAPER);
    const ctx=context(paper);
    const glow=ctx.createRadialGradient(p.width*.43,p.height*.42,0,p.width*.43,p.height*.42,Math.max(p.width,p.height)*.75);
    glow.addColorStop(0,'#fff5d96b');glow.addColorStop(1,'#99714a1e');
    ctx.fillStyle=glow;ctx.fillRect(0,0,p.width,p.height);
    p.randomSeed(84331);
    for(let i=0;i<Math.min(58000,p.width*p.height/14);i++){
      const x=p.random(p.width),y=p.random(p.height);
      ctx.fillStyle=i%2?'#876f4810':'#ffffff3a';
      ctx.fillRect(x,y,p.random(.3,1.2),p.random(.3,1.1));
    }
    for(const y of [p.height*.333,p.height*.666]){
      ctx.fillStyle='#a5886507';ctx.fillRect(0,y,p.width,1);
      ctx.fillStyle='#ffffff28';ctx.fillRect(0,y+1,p.width,1);
    }
    paintAutumnCanopy(ctx);
  }

  function autumnLeaf(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,angle:number,ink:string,alpha:number){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size,size);
    const points=[[-.05,.85],[-.34,.48],[-.72,.5],[-.57,.13],[-.95,-.1],[-.57,-.25],[-.59,-.64],[-.22,-.48],[0,-1],[.23,-.48],[.63,-.67],[.57,-.22],[.91,-.04],[.54,.18],[.68,.51],[.28,.46]];
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    points.slice(1).forEach(([px,py])=>ctx.lineTo(px,py));ctx.closePath();
    const wash=ctx.createLinearGradient(-.6,-.7,.5,.7);
    wash.addColorStop(0,rgba(ink,alpha*.55));wash.addColorStop(.5,rgba(ink,alpha));wash.addColorStop(1,rgba('#dab25d',alpha*.45));
    ctx.fillStyle=wash;ctx.fill();ctx.strokeStyle=rgba(ink,alpha*.45);ctx.lineWidth=.026;ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,1.15);ctx.quadraticCurveTo(.07,.1,0,-.86);
    for(const side of [-1,1]){
      ctx.moveTo(0,.25);ctx.lineTo(side*.48,-.10);
      ctx.moveTo(0,-.12);ctx.lineTo(side*.41,-.48);
    }
    ctx.strokeStyle=rgba('#74532f',alpha*.58);ctx.lineWidth=.018;ctx.stroke();ctx.restore();
  }

  function paintAutumnCanopy(ctx:CanvasRenderingContext2D){
    const w=p.width,h=p.height,unit=Math.min(w,h);
    p.randomSeed(101026);
    // Broad wet washes fill the upper field. The flower region stays clear.
    const washes: [number,number,number,string,number][] = [
      [.78,.08,.56,'#c58834',.16],[1.04,.27,.46,'#ac543c',.13],
      [.04,-.04,.36,'#c69a47',.14],[.72,.98,.37,'#b98048',.09],
    ];
    for(const [x,y,r,ink,alpha] of washes){
      const wash=ctx.createRadialGradient(x*w,y*h,0,x*w,y*h,r*unit);
      wash.addColorStop(0,rgba(ink,alpha));wash.addColorStop(.58,rgba(ink,alpha*.45));wash.addColorStop(1,rgba(ink,0));
      ctx.fillStyle=wash;ctx.fillRect(0,0,w,h);
    }
    const light=ctx.createRadialGradient(origin.x,origin.y-unit*.08,0,origin.x,origin.y-unit*.08,unit*.4);
    light.addColorStop(0,'#fff8e6a6');light.addColorStop(.5,'#fff3da4d');light.addColorStop(1,'#fff3da00');
    ctx.fillStyle=light;ctx.fillRect(0,0,w,h);
    const palette=['#ae662e','#c39332','#b05236','#d3a548','#96523b'];
    ctx.save();ctx.globalAlpha=.57;ctx.filter='blur(1.2px)';
    // Branches enter from outside the frame and taper toward open paper.
    const branches=[
      {start:{x:1.07,y:-.04},end:{x:.37,y:.16},bend:-.12},
      {start:{x:1.05,y:.12},end:{x:.76,y:.45},bend:.09},
      {start:{x:-.06,y:-.04},end:{x:.28,y:.12},bend:.09},
    ];
    branches.forEach((branch,index)=>{
      const a={x:branch.start.x*w,y:branch.start.y*h};
      const b={x:branch.end.x*w,y:branch.end.y*h};
      const c={x:mix(a.x,b.x,.43),y:mix(a.y,b.y,.43)+branch.bend*h};
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(c.x,c.y,b.x,b.y);
      ctx.strokeStyle='#75573738';ctx.lineWidth=index===0?1.35:.9;ctx.stroke();
      for(let j=0;j<18;j++){
        const t=(j+.5)/18,u=1-t;
        const x=u*u*a.x+2*u*t*c.x+t*t*b.x,y=u*u*a.y+2*u*t*c.y+t*t*b.y;
        const side=j%2?1:-1;
        const tx=x+p.random(-.055,.055)*w,ty=y+side*p.random(.025,.095)*h;
        ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(mix(x,tx,.55),y,tx,ty);
        ctx.strokeStyle='#8563412e';ctx.lineWidth=.6;ctx.stroke();
        for(let k=0;k<2;k++){
          const spread=unit*.034;
          autumnLeaf(ctx,tx+p.random(-spread,spread),ty+p.random(-spread,spread),p.random(.017,.043)*unit,p.random(-2.8,2.8),palette[(j+k+index)%5],p.random(.12,.30));
        }
      }
    });
    // A few fallen leaves balance the canopy across the empty lower-right field.
    for(let i=0;i<19;i++){
      const x=p.random(.65,1.04)*w,y=p.random(.89,1.04)*h;
      autumnLeaf(ctx,x,y,p.random(.012,.028)*unit,p.random(TAU),palette[i%5],p.random(.09,.19));
    }
    ctx.restore();
  }

  function layout() {
    const mobile=p.width<650;
    const preferredScale=mobile?Math.min(p.width/475,p.height/720):Math.min(p.width/950,p.height/680);
    // Preserve the approved flower scale and lower-third focal point.
    sceneScale=Math.min(preferredScale,Math.max(1,p.height/3-24)/206);
    const focal=specs[specs.length-1];
    origin={x:p.width*(mobile?.48:1/3)-focal.x*sceneScale,y:p.height*2/3-focal.y*sceneScale};
    makePaper();
  }

  function drawAutumn(time:number){
    const ctx=context(p);
    for(let i=0;i<8;i++){
      const phase=motion.matches?(i*.173)%1:(time*(.007+i%3*.001)+i*.173)%1;
      const lane=(i*.618)%1;
      const x=p.width*(.05+lane*.96)+Math.sin(phase*TAU+i)*p.width*.035;
      const y=p.height*(-.08+phase*1.19);
      const distance=Math.hypot((x-origin.x)/(p.width*.25),(y-origin.y)/(p.height*.28));
      const alpha=(.12+i%3*.02)*Math.min(1,Math.max(0,distance-.8))*Math.sin(phase*Math.PI);
      autumnLeaf(ctx,x,y,Math.min(p.width,p.height)*(.012+i%4*.004),-.5+Math.sin(phase*TAU+i)*1.3,i%2?'#b56b30':'#a25439',alpha);
    }
  }

  function attachment(f:Flower,time:number):Point{
    const breeze=motion.matches?0:Math.sin(time*.58+f.phase)*1.8+Math.sin(time*.27)*1.6;
    const distance=Math.hypot(f.x-pointer.x,f.y-pointer.y);
    const response=motion.matches?0:Math.exp(-distance/180)*lean*9;
    const wave=motion.matches?0:Math.sin((time-pulse)*5-distance*.022)*Math.exp(-Math.max(0,time-pulse)*1.3)*3;
    return {x:f.x+breeze+response+wave,y:f.y+Math.sin(f.phase+time*.48)*(motion.matches?0:.65)};
  }

  function drawStem(f:Flower,tip:Point,elapsed:number,index:number){
    const ctx=context(p);
    // Convert the viewport bottom into bouquet space, then undo handle compression.
    const bottom=(p.height-origin.y)/sceneScale+24;
    const root={x:22+(index%5-2)*5,y:100+(bottom-100)/.62};
    const progress=ease((elapsed-index*.05)/1.8);
    const points:Point[]=[];
    for(let j=0;j<=65;j++){
      const t=j/65*progress,u=1-t;
      points.push({x:u*u*u*root.x+3*u*u*t*12+3*u*t*t*(tip.x*.58)+t*t*t*tip.x,y:u*u*u*root.y+3*u*u*t*166+3*u*t*t*(tip.y+94)+t*t*t*tip.y});
    }
    // Keep the gathered upper stems while their roots reach below the viewport.
    points.forEach(point=>{if(point.y>100)point.y=100+(point.y-100)*.62;});
    trace(ctx,points);ctx.strokeStyle=index%3?'#74825a7a':'#6279529c';ctx.lineWidth=index%4?.7:1.05;ctx.stroke();
    if(progress>.85 && index%2===0){
      const at=points[43];
      const reveal=ease((elapsed-1.2-index*.07)/1.2);
      const dir=index%4===0?-1:1;
      ctx.save();ctx.translate(at.x,at.y);ctx.scale(reveal,reveal);
      ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(dir*22,-42,dir*61,-42,dir*70,-70);ctx.bezierCurveTo(dir*64,-16,dir*27,-12,0,0);
      ctx.fillStyle='#84926335';ctx.fill();ctx.strokeStyle='#7d8a648c';ctx.lineWidth=.7;ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(dir*36,-29,dir*70,-70);ctx.stroke();ctx.restore();
    }
  }

  function drawBinding(elapsed:number){
    const ctx=context(p);
    ctx.save();ctx.translate(0,38);ctx.scale(1,.62);ctx.globalAlpha=ease((elapsed-2.2)/1.2);
    ctx.strokeStyle='#967c598f';ctx.lineWidth=1;
    for(let i=0;i<3;i++){
      ctx.beginPath();ctx.moveTo(6,192+i*2);ctx.quadraticCurveTo(19,197+i*2,32,190+i*2);ctx.stroke();
    }
    ctx.beginPath();ctx.moveTo(20,195);ctx.bezierCurveTo(-14,172,-22,197,20,195);
    ctx.bezierCurveTo(51,173,55,198,20,195);ctx.stroke();
    ctx.beginPath();ctx.moveTo(20,195);ctx.quadraticCurveTo(10,219,-1,226);
    ctx.moveTo(22,195);ctx.quadraticCurveTo(39,212,35,232);ctx.stroke();
    ctx.restore();
  }

  function drawFlower(f:Flower,tip:Point,elapsed:number,_time:number){
    const ctx=context(p);
    const line=ease((elapsed-f.delay)/2.1);
    const ink=ease((elapsed-f.delay-1.65)/2.8);
    if(line<=0)return;
    ctx.save();ctx.translate(tip.x,tip.y);
    if(ink>0){
      ctx.save();ctx.beginPath();
      if(mode==='ripple'){
        for(let i=0;i<=90;i++){
          const a=i/90*TAU;
          const r=f.r*2.3*ink*(1+.045*Math.sin(a*7+f.phase));
          if(i===0)ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);
        }
        ctx.closePath();
      }else{
        f.petals.forEach((petal,i)=>{
          const t=ease(ink*1.28-i*.045);
          const cx=Math.cos(petal.angle)*petal.length*t*.48;
          const cy=Math.sin(petal.angle)*petal.length*t*.48;
          const rx=Math.max(.01,petal.length*t*.67);
          ctx.moveTo(cx+Math.cos(petal.angle)*rx,cy+Math.sin(petal.angle)*rx);
          ctx.ellipse(cx,cy,rx,Math.max(.01,f.r*t*.57),petal.angle,0,TAU);
        });
      }
      ctx.clip();
      p.image(f.wash,-f.size/2,-f.size/2,f.size,f.size);
      ctx.restore();
    }
    f.petals.forEach((petal,i)=>{
      trace(ctx,petal.points,clamp(line*1.65-i*.13));
      ctx.strokeStyle=rgba('#4f4941',f.r>70?.58:.39);ctx.lineWidth=.64;ctx.stroke();
      if(ink>.15){
        for(let vein=-1;vein<=1;vein++){
          const a=petal.angle+vein*.115;
          ctx.beginPath();ctx.moveTo(Math.cos(a)*f.r*.11,Math.sin(a)*f.r*.11);
          ctx.quadraticCurveTo(Math.cos(a)*petal.length*.48-Math.sin(a)*petal.bend,Math.sin(a)*petal.length*.48+Math.cos(a)*petal.bend,Math.cos(petal.angle)*petal.length*.92,Math.sin(petal.angle)*petal.length*.92);
          ctx.strokeStyle=rgba(f.color,.16*ink);ctx.lineWidth=.48;ctx.stroke();
        }
      }
    });
    if(f.pose!=='bud'&&ink>0){
      for(let i=0;i<6;i++){
        const a=f.angle+(i-2.5)*.18;
        const len=f.r*(.48+(i%3)*.10)*ease(ink*2);
        const tx=Math.cos(a)*len,ty=Math.sin(a)*len;
        ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(tx*.35+7,ty*.65,tx,ty);
        ctx.strokeStyle=rgba('#665538',.55*ink);ctx.lineWidth=.65;ctx.stroke();
        ctx.beginPath();ctx.ellipse(tx,ty,1.35,2.7,a+.4,0,TAU);ctx.fillStyle=rgba(i%2?'#806244':'#b58b39',.72*ink);ctx.fill();
      }
      for(let i=0;i<24;i++){
        const a=i*2.399+f.phase,d=f.r*(.10+(i%6)*.023);
        ctx.beginPath();ctx.ellipse(Math.cos(a)*d,Math.sin(a)*d,.6,1.05,a,0,TAU);ctx.fillStyle=rgba('#976443',.30*ink);ctx.fill();
      }
    }
    if(mode==='ripple'&&ink>0&&ink<1){
      ctx.beginPath();ctx.arc(0,0,f.r*1.8*ink,0,TAU);ctx.strokeStyle=rgba(f.color,.08*Math.sin(ink*Math.PI));ctx.lineWidth=.8;ctx.stroke();
    }
    ctx.restore();
  }

  function restart(next:Mode){
    mode=next;started=p.millis();
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
    if(motion.matches)p.redraw();
  }

  p.setup=()=>{
    const canvas=p.createCanvas(window.innerWidth,window.innerHeight);
    canvas.parent('bouquet');
    canvas.attribute('role','button');
    canvas.attribute('tabindex','0');
    canvas.attribute('aria-label','receive the watercolor bouquet');
    canvas.attribute('aria-pressed','false');
    p.pixelDensity(Math.min(window.devicePixelRatio||1,2));p.frameRate(40);
    p.randomSeed(74319);p.noiseSeed(74319);
    flowers=specs.map(paintFlower);layout();started=p.millis();
    const receiveBouquet=()=>{
      if(receivedAt!==undefined)return;
      receivedAt=p.millis();pulse=p.millis()/1000;
      document.body.classList.add('received');
      canvas.attribute('aria-pressed','true');
      if(motion.matches)p.redraw();
    };
    // SAFETY: p.createCanvas returns a renderer backed by an HTML canvas element.
    const element=canvas.elt as HTMLCanvasElement;
    element.addEventListener('pointermove',event=>{
      pointer={x:(event.clientX-origin.x)/sceneScale,y:(event.clientY-origin.y)/sceneScale};
      targetLean=clamp(event.clientX/p.width)*2-1;
    });
    element.addEventListener('pointerleave',()=>{targetLean=0;pointer={x:-1000,y:-1000};});
    element.addEventListener('pointerdown',event=>{
      pointer={x:(event.clientX-origin.x)/sceneScale,y:(event.clientY-origin.y)/sceneScale};
      pulse=p.millis()/1000;
      receiveBouquet();
    });
    element.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();receiveBouquet();}
    });
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
      const value=button.dataset.mode;if(value==='bloom'||value==='ripple')restart(value);
    }));
    motion.addEventListener('change',()=>{if(motion.matches){p.noLoop();p.redraw();}else p.loop();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)p.noLoop();else if(motion.matches)p.redraw();else p.loop();});
    if(motion.matches)p.noLoop();
  };
  p.draw=()=>{
    const time=p.millis()/1000;
    const elapsed=motion.matches?30:(p.millis()-started)/1000;
    lean=mix(lean,targetLean,.045);
    p.image(paper,0,0,p.width,p.height);
    drawAutumn(time);
    p.push();p.translate(origin.x,origin.y);p.scale(sceneScale);
    if(receivedAt!==undefined&&!motion.matches){
      const handoff=ease((p.millis()-receivedAt)/2200);
      p.rotate(Math.sin(handoff*Math.PI)*-.025);
      p.scale(1+Math.sin(handoff*Math.PI)*.035);
    }
    const tips=flowers.map(f=>attachment(f,time));
    flowers.forEach((f,i)=>drawStem(f,tips[i],elapsed,i));
    drawBinding(elapsed);
    flowers.forEach((f,i)=>drawFlower(f,tips[i],elapsed,time));
    p.pop();
  };
  p.windowResized=()=>{p.resizeCanvas(window.innerWidth,window.innerHeight);layout();if(motion.matches)p.redraw();};
});
