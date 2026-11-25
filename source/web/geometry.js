import * as THREE from 'three';
import {mergeGeometries, toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';

// Unified case boundary for future loaders. All lengths are metres; no physics outputs.
export const defaultCase = { schemaVersion: 1, configuration: 'tokamak', caseId: 'custom', geometry: { R0: 3, a: 1, kappa: 1.7, delta: 0.3 } };
export const vesselScale = 1.13;
export const firstWallScale = 1.055;
export const poloidalSegments = 48;
export const deviceLayers = {
  plasma: {label:'等离子体边界', color:'#55d8c0', note:'参数化 D 形包络。PRD 案例使用公开 GEQDSK 边界概略尺寸，实际磁通和边界见 R–Z 截面。'},
  vessel: {label:'真空室', color:'#7f9cad', note:'等离子体外侧的参数化真空包络。'},
  tf: {label:'TF 环向场线圈', color:'#bb8760', note:'沿环向均布的示意极向线圈。'},
  pf: {label:'PF 极向场线圈', color:'#b8a47b', note:'上下各两道示意环形线圈。'},
  cs: {label:'CS 中心螺线管', color:'#a8b8c7', note:'装置竖轴上的示意中心螺线管。'},
  wall: {label:'第一壁', color:'#b1a9a1', note:'等离子体与真空室之间的功能边界。'},
  structure: {label:'主支撑', color:'#91a0aa', note:'磁体外围立柱与下部环形底座。'},
  heating: {label:'射频加热接口', color:'#c48a4f', note:'低场侧的射频设备与耦合接口。PRD 参考采用公开离子回旋射频加热（ICRF）。', source:'https://doi.org/10.1017/S0022377820001269'},
  nbi: {label:'NBI 中性束注入', color:'#81b0bc', note:'外围独立研究示意，非 SPARC 基准。'},
  vacuum: {label:'真空抽气', color:'#86a6ca', note:'真空室低场侧的抽气接口与外置泵体。'},
  cooling: {label:'设备水冷', color:'#5fbed2', note:'外置换热设备及接至真空室侧的供水与回水接口。'},
  power: {label:'磁体电源', color:'#beab67', note:'外置电源及通向磁体外侧的供电连接。'},
};
export function validateGeometry(p) {
  if (!Object.values(p).every(Number.isFinite)) return '参数必须是有限数值。';
  if (p.R0 < 1 || p.R0 > 8 || p.a < .2 || p.a > 2 || p.kappa < 1 || p.kappa > 2.5 || Math.abs(p.delta) > .6) return '参数超出当前几何工作台范围。';
  if (p.R0 - p.a < .5) return '需要 R₀ − a ≥ 0.5 m，以保留简化中心结构空间。';
  if (p.R0 - 1.28 * p.a < .2) return 'TF 线圈内侧需保留至少 0.2 m 的中心结构空间。';
  return '';
}
// Right-handed Z-up. R and Z are metres, phi is radians from +X toward +Y.
export function cylindricalToWorld(R, phi, Z) {
  return [R * Math.cos(phi), R * Math.sin(phi), Z];
}

// Analytic D-shape, not a magnetic equilibrium or a fitted SPARC boundary.
export function boundary(p, theta, scale = 1) {
  return [p.R0 + scale * p.a * Math.cos(theta + Math.asin(p.delta) * Math.sin(theta)), scale * p.kappa * p.a * Math.sin(theta)];
}
export function surface(p, scale, sweep) {
  const vertices = [], indices = [], nt = poloidalSegments, np = 80;
  for (let j = 0; j <= np; j++) for (let i = 0; i <= nt; i++) {
    const phi = j / np * sweep, [r, z] = boundary(p, i / nt * Math.PI * 2, scale);
    vertices.push(...cylindricalToWorld(r, phi, z));
    if (i < nt && j < np) { const n = j * (nt + 1) + i; indices.push(n, n + nt + 1, n + 1, n + 1, n + nt + 1, n + nt + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
}
export function buildDevice(p, cutaway, hasDiagnosticSection=false, machineOptions) {
  const root = new THREE.Group(), layers = {};
  for (const id of Object.keys(deviceLayers)) { layers[id] = new THREE.Group(); layers[id].name = id; root.add(layers[id]); }
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .38, metalness: .45, side: THREE.DoubleSide, ...extra });
  const add = (layer, geometry, mat) => { const mesh = new THREE.Mesh(geometry, mat); layers[layer].add(mesh); return mesh; };
  const sweep=cutaway?Math.PI*1.5:Math.PI*2;
  const linePoints=(phi,scale)=>Array.from({length:64},(_,i)=>{
    const [r,z]=boundary(p,Math.PI*2*i/64,scale);
    return new THREE.Vector3(...cylindricalToWorld(r,phi,z));
  });
  function buildVessel(parent,angle,section) {
    const place=(geometry,finish)=>{const mesh=new THREE.Mesh(geometry,finish);parent.add(mesh);return mesh;};
    place(surface(p,vesselScale,angle),material(0x61707b,{metalness:.9,roughness:.35}));
    const seams=Math.round(angle/(Math.PI/8));
    for(let i=0;i<=seams;i++){
      if(!section&&i===seams)continue;
      const phi=i/seams*angle;
      const rim=section&&(i===0||i===seams);
      place(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(linePoints(phi,vesselScale),true),64,(rim ? .06 : .015)*p.a,10,true),
        material(rim?0x9fadb0:0x81919b,{metalness:.85,roughness:.3}));
    }
    for(const theta of [.49,Math.PI-.49,Math.PI+.49,Math.PI*2-.49]){
      const [r,z]=boundary(p,theta,vesselScale+.007);
      const rib=place(new THREE.TorusGeometry(r,.018*p.a,8,96,angle),material(0xa4afb6));
      rib.position.z=z;
    }
    if(section){
      const steel=material(0xbbc5c8,{metalness:.87,roughness:.35});
      for(let i=0;i<24;i++){
        const [r,z]=boundary(p,i*Math.PI/12,vesselScale+.009);
        const bolt=place(new THREE.CylinderGeometry(.022*p.a,.022*p.a,.018*p.a,6),steel);
        bolt.position.set(r,-.033*p.a,z);
      }
    }
  }
  const sectionVessel=new THREE.Group();
  sectionVessel.name='vessel';sectionVessel.visible=false;
  if(hasDiagnosticSection){
    buildVessel(sectionVessel,Math.PI*.45,true);
    root.add(sectionVessel);
  }
  const machine=machineOptions && buildMachineLayers(p,layers,machineOptions);
  if (!machine) {
    add('plasma',surface(p,1,Math.PI*2),material(0x40918e,{emissive:0x09393c,emissiveIntensity:.32,metalness:.28,roughness:.62}));
    buildVessel(layers.vessel,sweep,cutaway);
    for (let j = 0; j < 16; j++) {
      const phi = j / 16 * Math.PI * 2;
      if (cutaway && phi > Math.PI * 1.5) continue;
      const points = Array.from({ length: 65 }, (_, i) => { const [r, z] = boundary(p, i / 64 * 2 * Math.PI, 1.28); return new THREE.Vector3(...cylindricalToWorld(r, phi, z)); });
      add('tf', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 64, .065 * p.a, 8, true), material(0xa68262,{metalness:.68,roughness:.43}));
    }
    for (const sign of [-1, 1]) for (const level of [.72, 1.25]) {
      const mesh = add('pf', new THREE.TorusGeometry(p.R0 + (level === .72 ? .98 : -.1) * p.a, .085 * p.a, 8, 80), material('#b8a47b'));
      mesh.position.z = sign * level * p.kappa * p.a;
    }
    const csRadius = Math.min(.35 * p.R0, (p.R0 - 1.28 * p.a) * .75);
    const cs = add('cs', new THREE.CylinderGeometry(csRadius, csRadius, p.kappa * p.a * 2.8, 32), material('#a8b8c7'));
    cs.rotation.x = Math.PI / 2;
    add('wall',surface(p,firstWallScale,sweep),material(0x868183,{metalness:.66,roughness:.48}));
  }

  // Four illustrative service sectors between TF planes and away from the TS viewing sector.
  const {R0,a,kappa}=p;
  const world=(offset,phi,height)=>new THREE.Vector3(...cylindricalToWorld(R0+offset*a,phi,height*a));
  const box=(id,center,phi,width,depth,height,color=deviceLayers[id].color)=>{
    const mesh=add(id,new THREE.BoxGeometry(width*a,depth*a,height*a),material(color));
    mesh.position.copy(center); mesh.rotation.z=phi;
  };
  const pipe=(id,start,end,radius)=>{
    const direction=end.clone().sub(start);
    const mesh=add(id,new THREE.CylinderGeometry(radius*a,radius*a,direction.length(),12),material(deviceLayers[id].color));
    mesh.position.copy(start).lerp(end,.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  };
  const tank=(id,start,end,radius,color,capColor)=>{
    const direction=end.clone().sub(start), length=direction.length(), axis=direction.normalize();
    const shell=add(id,new THREE.CapsuleGeometry(radius*a,Math.max(.01,length-2*radius*a),8,24),material(color));
    shell.position.copy(start).lerp(end,.5);shell.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);
    for(const point of [start,end]){
      const flange=add(id,new THREE.CylinderGeometry(radius*a*1.10,radius*a*1.10,.062*a,28),material(capColor));
      flange.position.copy(point);flange.quaternion.copy(shell.quaternion);
    }
  };
  if (!machine) {
    const base=add('structure',new THREE.TorusGeometry(R0+1.43*a,.09*a,8,80),material(deviceLayers.structure.color));
    base.position.z=-1.53*kappa*a;
    for (const phi of [1,5,9,13].map(i=>i*Math.PI/8)) {
      box('structure',world(1.43,phi,-1.18*kappa),phi,.14,.2,.70*kappa);
      box('structure',world(1.43,phi,-1.51*kappa),phi,.35,.39,.09,0x879ca4);
      box('structure',world(1.36,phi,-.85*kappa),phi,.29,.32,.095,0x9bb0b5);
    }
  }
  for (const [id,sector,height,offset] of [['heating',17,0,1.92],['vacuum',9,0,1.85],['cooling',21,-.25,1.95],['power',23,-.7,2.12]]) {
    const phi=sector*Math.PI/16;
    if(id==='heating'&&machineOptions?.buildIcrf){
      // The outboard mock interface sits in the gap between adjacent TF housings.
      const angle=Math.PI, anchor=world(vesselScale,angle,0);
      const heating=machineOptions.buildIcrf(layers.heating,{anchor,phi:angle,a,floor:-1.6*kappa*a,reference:machineOptions.sparc});
      machine.heating=heating;
      Object.assign(machine.facts,heating.facts);
      continue;
    }
    if(id==='vacuum'&&machineOptions?.buildVacuum){
      const anchor=world(vesselScale,phi,height);
      const vacuum=machineOptions.buildVacuum(layers.vacuum,{anchor,phi,a,floor:-1.6*kappa*a,portDiameter:.09*a});
      machine.vacuum=vacuum;
      Object.assign(machine.facts,vacuum.facts);
      continue;
    }
    if(id==='cooling'&&machineOptions?.buildCooling){
      const anchor=world(offset,phi,-1.6*kappa);
      const cooling=machineOptions.buildCooling(layers.cooling,{anchor,phi,a});
      machine.cooling=cooling;
      Object.assign(machine.facts,cooling.facts);
      continue;
    }
    if(id==='power'&&machineOptions?.buildPower){
      const angle=310*Math.PI/180, anchor=world(2.15,angle,-1.6*kappa);
      const power=machineOptions.buildPower(layers.power,{anchor,phi:angle,a});
      machine.power=power;
      Object.assign(machine.facts,power.facts);
      continue;
    }
    const center=world(offset,phi,height);
    box(id,world(offset,phi,height-.34),phi,.53,.52,.09,0x58636a);
    if(id==='cooling'||id==='vacuum'){
      const vertical=new THREE.Vector3(0,0,a);
      tank(id,center.clone().addScaledVector(vertical,-.22),center.clone().addScaledVector(vertical,.25),.19,
        id==='cooling'?0x558f99:0x8f9da2,0xaebbbe);
      tank(id,world(offset+.15,phi,height-.14),world(offset+.42,phi,height-.14),.085,0x445e68,0x9fadb0);
    }else{
      box(id,center,phi,.44,.46,.55,id==='heating'?0x81746b:0x747e83);
      box(id,world(offset+.23,phi,height+.03),phi,.025,.40,.45,0x293f4b);
      for(let i=0;i<7;i++) box(id,world(offset+.249,phi,height-.17+i*.038),phi,.017,.33,.012,0x7e969c);
      box(id,world(offset+.25,phi,height+.204),phi,.021,.101,.032,id==='heating'?0xe89c58:0xa2c4b3);
    }
    const elevations=id==='cooling'?[height-.08,height+.08]:[height];
    for (const z of elevations) {
      const theta=Math.asin(z/(vesselScale*kappa));
      const [vesselR]=boundary(p,theta,vesselScale);
      const interfaceOffset=id==='power'?1.36:(vesselR-R0)/a;
      pipe(id,world(interfaceOffset,phi,z),world(offset-.24,phi,z),.045);
    }
  }
  if(machineOptions?.buildNbi){
    const sector=42*Math.PI/180;
    const anchor=world(3.95,sector,-1.6*kappa);
    const nbi=machineOptions.buildNbi(layers.nbi,{anchor,phi:sector+Math.PI/10,a});
    machine.nbi=nbi;
    Object.assign(machine.facts,nbi.facts);
  }
  return { root, layers, sectionVessel, machine };
}

const turn = 2*Math.PI;
const assemblySource = 'https://blog.cfs.energy/cfs-takes-its-next-step-toward-fusion-energy-assembling-the-sparc-tokamak/';
const tfSource = 'https://blog.cfs.energy/our-sparc-fusion-facility-is-now-about-75-done-take-a-virtual-tour-of-the-progress/';
const toroidalProfile = (p, scale, samples=96) =>
  Array.from({length:samples+1}, (_,i)=>boundary(p,turn*i/samples,scale));

function sweepProfile(profile, from, span, segments, opening) {
  const xyz=[], faces=[], stride=profile.length;
  for (let j=0; j<=segments; j++) {
    const phi=from+span*j/segments;
    for (const [r,z] of profile) xyz.push(...cylindricalToWorld(r,phi,z));
  }
  for (let j=0; j<segments; j++) {
    const phi=from+span*(j+.5)/segments;
    for (let i=0; i<stride-1; i++) {
      if (opening) {
        const [r,z]=profile[i], [nextR,nextZ]=profile[i+1];
        if (opening((r+nextR)/2,phi,(z+nextZ)/2)) continue;
      }
      const n=j*stride+i;
      faces.push(n,n+stride,n+1,n+1,n+stride,n+stride+1);
    }
  }
  const mesh=new THREE.BufferGeometry();
  mesh.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  mesh.setIndex(faces);
  mesh.computeVertexNormals();
  return mesh;
}

function ringShape(outer, inner) {
  const vectors=profile=>profile.map(([r,z])=>new THREE.Vector2(r,z));
  const shape=new THREE.Shape(vectors(outer));
  if(inner)shape.holes.push(new THREE.Path(vectors(inner)));
  return shape;
}

function poloidalPlate(shape, thickness, bevel=0) {
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,steps:1,bevelEnabled:bevel>0,
    bevelThickness:bevel,bevelSize:bevel,bevelSegments:1});
  return geometry.translate(0,0,-thickness/2).rotateX(Math.PI/2);
}

function sectorBelt(r,z,width,height) {
  const b=Math.min(width,height)*.20, ri=r-width/2, ro=r+width/2, lo=z-height/2, hi=z+height/2;
  return [[ro,lo+b],[ro,hi-b],[ro-b,hi],[ri+b,hi],[ri,hi-b],[ri,lo+b],[ri+b,lo],[ro-b,lo],[ro,lo+b]];
}

// Visible parts are batched by layer and finish. The existing picker still sees one layer per system.
function buildMachineLayers(p,layers,{internal,field,ports=[],sparc}) {
  const {R0,a,kappa}=p, H=kappa*a;
  const start=internal?-Math.PI/9:0, sweep=internal?11*Math.PI/9:turn;
  const showAngle=phi=>((phi-start+turn)%turn)<=sweep;
  const steel=(color,roughness=.33,metalness=.79)=>new THREE.MeshStandardMaterial({
    color,roughness,metalness,side:THREE.DoubleSide,
  });
  const hull=steel(0x687e8a,.33), skin=steel(0x93a3ab,.30), rim=steel(0xb0bbc1,.30);
  const shadowMetal=steel(0x303e49,.38), lining=steel(0x2d383e,.56), tile=steel(0x566267,.49,.60);
  const magnet=steel(0x655446,.38), tfCase=steel(0x56636e,.33), winding=steel(0xa98858,.35), frame=steel(0x4d6571,.38);
  const glass=steel(0x305363,.21,.27), plasma=steel(0x398e8a,.49,.28);
  if(internal) Object.assign(plasma,{transparent:true,opacity:.23,depthWrite:false});
  const parts=new Map();
  function put(layer,finish,geometry) {
    if(!parts.has(layer))parts.set(layer,new Map());
    const finishes=parts.get(layer);
    if(!finishes.has(finish))finishes.set(finish,[]);
    const piece=geometry.index?geometry.toNonIndexed():geometry;
    if(piece!==geometry)geometry.dispose();
    piece.deleteAttribute('uv');
    finishes.get(finish).push(piece);
  }
  function belt(layer,finish,profile,from=start,span=sweep,segments=100) {
    const resolution=span===sweep?Math.ceil(segments*sweep/turn):segments;
    put(layer,finish,sweepProfile(profile,from,span,resolution));
    if(span===sweep && internal) for(const end of [from,from+span]) {
      put(layer,finish,new THREE.ShapeGeometry(ringShape(profile)).rotateX(Math.PI/2).rotateZ(end));
    }
  }
  function block(layer,finish,length,width,height,r,phi,z) {
    put(layer,finish,new THREE.BoxGeometry(length,width,height).rotateZ(phi).translate(...cylindricalToWorld(r,phi,z)));
  }
  function radialTurn(layer,finish,profile,phi,z,y=0,segments=32) {
    const turned=new THREE.LatheGeometry(profile.map(([axial,r])=>new THREE.Vector2(r,axial)),segments);
    put(layer,finish,turned.rotateZ(-Math.PI/2).translate(0,y,z).rotateZ(phi));
  }

  const outer=toroidalProfile(p,vesselScale,80);
  const inner=toroidalProfile(p,1.078,80);
  const shellRadius=z=>{
    const scale=vesselScale;
    return boundary(p,Math.asin(z/(scale*H)),scale)[0];
  };
  const tfCount=sparc?18:16;
  const pitch=turn/tfCount;
  const coilAngles=Array.from({length:tfCount},(_,i)=>(i+.5)*pitch).filter(showAngle);
  const portMounts=[-6,-4,2,4,7].map(sector=>{
    const phi=sector*pitch, z=0, lip=shellRadius(z)+.38*a;
    return {phi,z,radius:.255*a,lip,viewport:false};
  }).concat(ports.map(({center:[x,y,z],diameter})=>({
    phi:Math.atan2(y,x),z,radius:diameter/2,lip:Math.hypot(x,y),viewport:true,
  }))).filter(port=>showAngle(port.phi));
  const opening=(r,phi,z)=>r>R0 && portMounts.some(port=>{
    const offset=phi-port.phi;
    return Math.cos(offset)>.92 && Math.hypot(r*Math.sin(offset),z-port.z)<port.radius*.97;
  });
  const shellSegments=Math.ceil(144*sweep/turn);
  put('vessel',hull,sweepProfile(outer,start,sweep,shellSegments,opening));
  put('vessel',shadowMetal,sweepProfile(inner.toReversed(),start,sweep,shellSegments,opening));
  for(const theta of [1.03,2.13,4.15,5.24]) {
    const [r,z]=boundary(p,theta,vesselScale+.013);
    belt('vessel',skin,sectorBelt(r,z,.093*a,.052*a));
  }
  for(const phi of coilAngles) {
    belt('vessel',skin,toroidalProfile(p,vesselScale+.007,64),phi+pitch*.19,pitch*.073,1);
  }
  if(internal) for(const phi of [start,start+sweep]) {
    put('vessel',rim,new THREE.ShapeGeometry(ringShape(outer,inner)).rotateX(Math.PI/2).rotateZ(phi));
  }
  for(const {phi,z,radius,lip,viewport} of portMounts) {
    const back=shellRadius(z)-.12*a, w=.052*a, neck=radius+.05*a;
    radialTurn('vessel',shadowMetal,[[back,radius],[back,neck],[lip-w,neck],[lip-w,radius],[back,radius]],phi,z);
    radialTurn('vessel',skin,[[back+.049*a,neck*.97],[back+.04*a,1.22*neck],[back+.105*a,1.22*neck],
      [back+.132*a,neck*.98],[back+.049*a,neck*.97]],phi,z);
    const flange=radius+.116*a;
    radialTurn('vessel',rim,[[lip-1.2*w,radius],[lip-1.2*w,flange-w*.22],[lip-.94*w,flange],
      [lip+.20*w,flange],[lip+.45*w,flange-w*.25],[lip+.45*w,radius],[lip-1.2*w,radius]],phi,z,0,48);
    radialTurn('vessel',viewport?glass:shadowMetal,[[lip-.75*w,0],[lip-.75*w,radius],[lip-.52*w,radius],[lip-.52*w,0]],phi,z);
    for(let j=0;j<8;j++){
      const angle=(j+.5)*turn/8, boltRadius=radius+.074*a, bolt=.017*a;
      radialTurn('vessel',skin,[[lip+.44*w,0],[lip+.44*w,bolt],[lip+.72*w,bolt],[lip+.72*w,0]],
        phi,z+boltRadius*Math.sin(angle),boltRadius*Math.cos(angle),6);
    }
  }

  const tfOuter=toroidalProfile(p,1.365,64), tfInner=toroidalProfile(p,1.195,64);
  const tfBody=ringShape(tfOuter,tfInner);
  const tfCover=ringShape(toroidalProfile(p,1.337,48),toroidalProfile(p,1.224,48));
  const tfShell=toCreasedNormals(poloidalPlate(tfBody,.245*a,.018*a),Math.PI/4);
  const tfPanel=toCreasedNormals(poloidalPlate(tfCover,.021*a,.009*a),Math.PI/4);
  for(const phi of coilAngles) {
    put('tf',tfCase,tfShell.clone().rotateZ(phi));
    for(const side of [-1,1]) {
      put('tf',skin,tfPanel.clone().translate(0,side*.142*a,0).rotateZ(phi));
    }
    const [r,z]=boundary(p,0,1.36);
    block('tf',shadowMetal,.10*a,.326*a,.21*a,r-.029*a,phi,z-.26*H);
    for(const y of [-.098*a,.098*a]) {
      const head=.023*a;
      radialTurn('tf',rim,[[r+.020*a,0],[r+.020*a,head],[r+.033*a,head],[r+.033*a,0]],
        phi,z-.26*H,y,6);
    }
  }
  tfShell.dispose();tfPanel.dispose();

  for(const sign of [-1,1]) for(const level of [.72,1.25]) {
    const r=R0+(level===.72?.98:-.1)*a, z=sign*level*H;
    belt('pf',magnet,sectorBelt(r,z,.168*a,.162*a));
    for(const dz of [-.065,.065]) belt('pf',skin,sectorBelt(r,z+dz*a,.175*a,.034*a));
    belt('pf',winding,sectorBelt(r+.083*a,z,.016*a,.066*a));
    for(const [i,phi] of coilAngles.entries()){
      if(i%3!==0)continue;
      const [anchorR]=boundary(p,Math.asin(sign*level/1.28),1.28);
      const width=Math.abs(r-anchorR)+.20*a;
      block('pf',frame,width,.107*a,.075*a,(r+anchorR)/2,phi,z+sign*.095*a);
    }
  }

  const csRadius=Math.min(.35*R0,(R0-1.28*a)*.75), csBottom=-1.40*H;
  const moduleHeight=2.8*H/6;
  const shaft=(finish,r,lo,hi)=>put('cs',finish,
    new THREE.CylinderGeometry(r,r,hi-lo,64).rotateX(Math.PI/2).translate(0,0,(hi+lo)/2));
  for(let i=0;i<6;i++){
    const lo=csBottom+i*moduleHeight,hi=lo+moduleHeight;
    shaft(magnet,csRadius*.98,lo+.039*a,hi-.039*a);
    shaft(shadowMetal,csRadius*.94,lo,hi);
    shaft(i%2===0?skin:rim,csRadius,lo+.047*a,lo+.098*a);
    shaft(winding,csRadius,hi-.117*a,hi-.088*a);
  }
  for(let i=0;i<12;i++){
    const phi=i*turn/12;
    put('cs',rim,new THREE.CylinderGeometry(.028*a,.028*a,.028*a,6).rotateX(Math.PI/2)
      .translate(...cylindricalToWorld(.865*csRadius,phi,1.40*H+.014*a)));
  }

  const wall=toroidalProfile(p,firstWallScale,64);
  const liner=toroidalProfile(p,1.068,48);
  put('wall',lining,sweepProfile(liner,start,sweep,Math.ceil(88*sweep/turn)));
  const wallPanels=Math.round(sweep/turn*48);
  for(let i=0;i<wallPanels;i++){
    const angle=sweep/wallPanels;
    put('wall',i%5===0?lining:tile,sweepProfile(wall,start+(i+.044)*angle,angle*.912,2));
  }
  if(internal)for(const phi of [start,start+sweep]){
    put('wall',lining,new THREE.ShapeGeometry(ringShape(liner,wall)).rotateX(Math.PI/2).rotateZ(phi));
  }
  const lcfs=field?.plasmaBoundary??toroidalProfile(p,1,64);
  put('plasma',plasma,sweepProfile(lcfs,start,sweep,Math.ceil(96*sweep/turn)));
  if(internal&&!field) for(const end of [start,start+sweep]) {
    put('plasma',plasma,new THREE.ShapeGeometry(ringShape(lcfs)).rotateX(Math.PI/2).rotateZ(end));
  }

  const floor=-1.60*H, railR=R0+1.43*a, railZ=floor+.11*a;
  belt('structure',frame,sectorBelt(railR,railZ,.35*a,.16*a),0,turn,112);
  belt('structure',skin,sectorBelt(railR,railZ+.09*a,.36*a,.04*a),0,turn,112);
  belt('structure',frame,sectorBelt(csRadius*.79,floor+.10*H,.28*csRadius,.20*H),0,turn,80);
  for(const [i,phi] of coilAngles.entries()){
    if(i%2)continue;
    const [footR,footZ]=boundary(p,-1.08,1.365);
    const shoe=railZ+.10*a;
    const gusset=[[footR-.12*a,footZ-.04*a],[footR+.15*a,footZ+.05*a],
      [railR+.03*a,shoe+.025*a],[railR-.23*a,shoe+.025*a],[footR-.12*a,footZ-.04*a]];
    put('structure',frame,poloidalPlate(ringShape(gusset),.25*a,.018*a).rotateZ(phi));
    block('structure',skin,.42*a,.43*a,.07*a,railR,phi,floor+.035*a);
    block('structure',skin,.33*a,.29*a,.062*a,footR,phi,footZ-.031*a);
  }

  for(const [id, finishes] of parts) for(const [finish, geometries] of finishes){
    layers[id].add(new THREE.Mesh(mergeGeometries(geometries),finish));
    for(const geometry of geometries)geometry.dispose();
  }
  const metres=value=>`${value.toFixed(3)} m`;
  const reference=field?(field.source.name??'SPARCPublic PRD GEQDSK 轴对称截面'):'平台解析 D 形参考截面';
  const engineering='自主参数化外观 · 工程未验证';
  return {
    cutAngle:internal?start:undefined,
    facts:{
      vessel:{system:'真空边界',status:engineering,source:sparc?assemblySource:undefined,
        note:`截面采用 ${reference} 的概略尺寸。法兰、接管和加强带按现有空间配置示意。`,
        rows:[['模型壁厚标度',metres((vesselScale-1.078)*a)],['当前可见端口',String(portMounts.length)]]},
      tf:{system:'环向磁场',status:engineering,source:sparc?tfSource:undefined,
        note:sparc?'SPARC 线圈数量取公开资料，D 形壳体剖面和固定结构为自主参数。':'D 形实体外壳按当前工况围绕真空室均布。',
        rows:[['完整阵列',`${tfCount} 套`],['壳体环向厚度',metres(.281*a)]]},
      pf:{system:'极向磁场',status:engineering,source:sparc?assemblySource:undefined,
        note:'保留既有四道示意线圈的位置，加入实体外壳、护边和安装鞍座。',
        rows:[['径向中心',`${metres(R0-.1*a)} / ${metres(R0+.98*a)}`],['高度 |Z|',`${metres(.72*H)} / ${metres(1.25*H)}`]]},
      cs:{system:'磁通驱动',status:engineering,source:sparc?assemblySource:undefined,
        note:'沿竖轴排列的分段护套示意。总体半径及高度沿用既有模型。',
        rows:[['外半径',metres(csRadius)],['总高',metres(2.8*H)]]},
      wall:{system:'等离子体面对部件',status:engineering,
        note:'分块第一壁包覆在等离子体与真空室之间，采用参数化间隔与面板缝。',
        rows:[['轮廓比例',String(firstWallScale)]]},
      plasma:{system:'等离子体物理',status:field?(sparc?'参考边界已对照 GEQDSK':'已求解的条件性 GS 边界'):'解析几何示意',
        note:field?(sparc?'直接旋转 FreeGS 文件的 LCFS 坐标。内部展示可见同一 PRD 温度或密度截面。':
          '直接旋转本案例冻结的 LCFS 坐标。内部截面与该场共用 R–Z 网格。'):'使用当前工况的解析 D 形包络。',
        source:field?.source.url,rows:[['大半径 R₀',metres(R0)],['小半径 a',metres(a)]]},
      structure:{system:'机械支承',status:engineering,
        note:'环形落地底座以板式撑件承接 TF 下肩，中央独立底座托住 CS。',
        rows:[['底座环中心半径',metres(railR)],['安装基面 Z',metres(floor)]]},
    },
  };
}

export function selectionOutline(objects) {
  const outline=new THREE.Group();
  const finish=new THREE.ShaderMaterial({
    side:THREE.BackSide,
    vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*0.007,1.0);}',
    fragmentShader:'void main(){gl_FragColor=vec4(0.40,0.94,0.88,1.0);}',
  });
  for(const root of objects){
    root.updateWorldMatrix(true,true);
    root.traverse(node=>{
      if(!node.isMesh)return;
      const edge=new THREE.Mesh(node.geometry,finish);
      edge.matrixAutoUpdate=false;edge.matrix.copy(node.matrixWorld);
      edge.userData.borrowedGeometry=true;
      outline.add(edge);
    });
  }
  if(!outline.children.length)finish.dispose();
  return outline;
}

export function disposeDevice(root) {
  const materials=new Set();
  root.traverse(object=>{
    if(!object.userData.borrowedGeometry)object.geometry?.dispose();
    if(object.material)materials.add(object.material);
  });
  for(const material of materials)material.dispose();
}
