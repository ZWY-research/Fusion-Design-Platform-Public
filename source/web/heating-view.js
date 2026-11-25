import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const sparcReference='https://doi.org/10.1063/5.0162457';
const beamReference='https://www.igi.cnr.it/en/research/negative-ion-neutral-beam-injection/mitica/components-of-mitica/';
const X=new THREE.Vector3(1,0,0), Y=new THREE.Vector3(0,1,0), Z=new THREE.Vector3(0,0,1);

function batch(root) {
  const finishes=new Map();
  for(const mesh of root.children){
    if(!mesh.isMesh)continue;
    if(!finishes.has(mesh.material))finishes.set(mesh.material,[]);
    finishes.get(mesh.material).push(mesh);
  }
  for(const [finish,meshes] of finishes){
    if(meshes.length<2)continue;
    const geometries=meshes.map(mesh=>{
      mesh.updateMatrix();
      const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
      if(geometry!==mesh.geometry)mesh.geometry.dispose();
      geometry.deleteAttribute('uv');
      return geometry.applyMatrix4(mesh.matrix);
    });
    root.remove(...meshes);
    root.add(new THREE.Mesh(mergeGeometries(geometries),finish));
    for(const geometry of geometries)geometry.dispose();
  }
}

function model(group,{anchor,phi,a},prefix,system,source,status) {
  group.position.copy(anchor);
  group.rotation.z=phi;
  const p=(x,y,z)=>new THREE.Vector3(x*a,y*a,z*a);
  const m=value=>`${(value*a).toFixed(3)} m`;
  const metals=(color,roughness=.34,metalness=.75)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const steel=metals(0xa2b1bc), bright=metals(0xc1cbd0,.26), frame=metals(0x526976,.44);
  const dark=metals(0x283942,.44), blue=metals(0x3e6579,.40,.61);
  const amber=metals(0xa77848,.37,.62), bronze=metals(0x805d51,.41,.66);
  const finishes={steel,bright,frame,dark,blue,amber,bronze};
  const parts={},facts={};
  function addPart(id,label,at,note,connection,rows){
    const root=new THREE.Group(), key=prefix+'-'+id;
    root.name=key;group.add(root);parts[key]=root;
    const [x,y,z]=at;
    facts[key]={label,system,source,status,note,
      rows:[...rows,['参考位置 XYZ（m）',p(x,y,z).applyAxisAngle(Z,phi).add(anchor).toArray().map(v=>v.toFixed(3)).join(', ')],
        ['连接／位置关系',connection],['几何来源','自主参数化外形']]};
    return root;
  }
  function mesh(parent,geometry,finish,at) {
    const object=new THREE.Mesh(geometry,finish);
    if(at)object.position.copy(at);
    parent.add(object);
    return object;
  }
  function box(parent,x,y,z,w,d,h,finish) {
    return mesh(parent,new THREE.BoxGeometry(w*a,d*a,h*a),finish,p(x,y,z));
  }
  function turned(parent,at,direction,profile,finish,segments=40) {
    const geometry=new THREE.LatheGeometry(profile.map(([s,r])=>new THREE.Vector2(r*a,s*a)),segments);
    const object=mesh(parent,geometry,finish,p(...at));
    object.quaternion.setFromUnitVectors(Y,direction);
    return object;
  }
  function pin(parent,at,direction,r,length,finish,segments=24) {
    const object=mesh(parent,new THREE.CylinderGeometry(r*a,r*a,length*a,segments),finish,p(...at));
    object.quaternion.setFromUnitVectors(Y,direction);
    return object;
  }
  function collar(parent,x,y,z,r,inner,finish=bright,bolts=8) {
    turned(parent,[x,y,z],X,[[-.032,inner],[-.032,r-.013],[-.020,r],[.020,r],
      [.032,r-.013],[.032,inner],[-.032,inner]],finish);
    for(let i=0;i<bolts;i++){
      const theta=(i+.5)*2*Math.PI/bolts, circle=r-.024;
      pin(parent,[x-.034,y+circle*Math.cos(theta),z+circle*Math.sin(theta)],X,.013,.017,dark,6);
    }
  }
  function chamferedCase(parent,x,y,z,l,w,h,finish) {
    const u=w/2,v=h/2,b=Math.min(w,h)*.13;
    const profile=[[-u+b,-v],[u-b,-v],[u,-v+b],[u,v-b],[u-b,v],[-u+b,v],[-u,v-b],[-u,-v+b]];
    const shape=new THREE.Shape(profile.map(([s,t])=>new THREE.Vector2(s*a,t*a)));
    const geometry=new THREE.ExtrudeGeometry(shape,{steps:1,depth:l*a,bevelEnabled:true,
      bevelSize:.008*a,bevelThickness:.008*a,bevelSegments:1}).translate(0,0,-l*a/2);
    geometry.applyMatrix4(new THREE.Matrix4().makeBasis(Y,Z,X));
    mesh(parent,geometry,finish,p(x,y,z));
  }
  function foot(parent,x,y,floor,w=.27,d=.23) {
    box(parent,x,y,floor+.026,w,d,.052,steel);
  }
  function cradle(parent,x,z,floor,width=.72) {
    box(parent,x,0,z,.19,width,.11,frame);
    for(const y of [-width*.36,width*.36]){
      const top=z-.04;
      box(parent,x,y,(floor+top)/2,.12,.105,top-floor,frame);
      foot(parent,x,y,floor);
    }
  }
  const finishParts=()=>{for(const root of Object.values(parts))batch(root);};
  return {p,m,parts,facts,finishes,addPart,mesh,box,turned,pin,collar,chamferedCase,foot,cradle,finishParts};
}

export function buildIcrfSystem(group,{anchor,phi,a,floor,reference}) {
  const label=reference?'ICRF 射频加热 · SPARC 公开参考':'ICRF 射频加热 · 通用示意';
  const status=reference?'SPARC 公开参考 · 外形与布置未验证':'自主参数化示意 · 工程未验证';
  const kit=model(group,{anchor,phi,a},'heating','ICRF 离子回旋射频加热',sparcReference,status);
  const {p,m,parts,facts,finishes:{steel,bright,frame,dark,amber,blue},addPart,mesh,box,turned,pin,
    collar,chamferedCase,foot,cradle,finishParts}=kit;
  const base=(floor-anchor.z)/a, coaxZ=.03, cabinetIn=base+.65;
  const port=addPart('port','ICRF 真空室接口与天线外罩',[.20,0,coaxZ],
    '一支代表性外罩及接口座贴合真空室外壁。安装扇区、尺寸及机柜外形为自主示意。',
    '真空室外壁 → 天线外罩 → 同轴传输线',[['接口罩宽 × 高',`${m(.53)} × ${m(.66)}`]]);
  chamferedCase(port,.032,0,coaxZ,.104,.53,.66,steel);
  chamferedCase(port,.110,0,coaxZ,.046,.49,.599,dark);
  chamferedCase(port,.265,0,coaxZ,.294,.44,.55,blue);
  chamferedCase(port,.423,0,coaxZ,.048,.49,.60,bright);
  for(const y of [-.188,.188])for(const z of [-.229,.229]){
    pin(port,[.454,y,coaxZ+z],X,.022,.029,dark,6);
  }
  turned(port,[.425,0,coaxZ],X,[[0,0],[0,.129],[.073,.129],[.127,.083],[.161,.083],[.161,0]],amber);
  collar(port,.58,0,coaxZ,.117,.059,bright,6);

  const line=addPart('coax','ICRF 同轴传输线',[1.38,0,coaxZ],
    '展示外部同轴护管、弯头、法兰及落地支架。','射频源机柜 → 同轴外护管 → 主机接口',
    [['外护管直径',m(.156)],['端点连接','径向端口与机柜侧接口']]);
  const curve=new THREE.CurvePath();
  const straight=(v,w)=>curve.add(new THREE.LineCurve3(p(...v),p(...w)));
  const turn=(v,c,w)=>curve.add(new THREE.QuadraticBezierCurve3(p(...v),p(...c),p(...w)));
  straight([.58,0,coaxZ],[1.19,0,coaxZ]);
  turn([1.19,0,coaxZ],[1.39,0,coaxZ],[1.39,0,coaxZ-.21]);
  straight([1.39,0,coaxZ-.21],[1.39,0,cabinetIn+.20]);
  turn([1.39,0,cabinetIn+.20],[1.39,0,cabinetIn],[1.59,0,cabinetIn]);
  straight([1.59,0,cabinetIn],[1.92,0,cabinetIn]);
  mesh(line,new THREE.TubeGeometry(curve,54,.078*a,18,false),steel);
  collar(line,.99,0,coaxZ,.115,.063,bright,6);
  collar(line,1.92,0,cabinetIn,.112,.059,bright,6);
  pin(line,[1.03,0,coaxZ],X,.088,.09,amber);
  cradle(line,1.02,coaxZ-.131,base,.46);

  const rack=addPart('rack','ICRF 射频源机柜',[2.38,0,base+.81],
    '落地射频源机柜示意，具备前面板、散热槽和侧接线接口。',
    '射频源机柜 → 同轴传输线',[['箱体宽 × 高',`${m(.76)} × ${m(1.49)}`]]);
  box(rack,2.43,0,base+.817,.90,.76,1.49,dark);
  box(rack,2.43,0,base+.067,1.03,.85,.09,frame);
  box(rack,2.43,0,base+1.565,.94,.79,.055,steel);
  box(rack,2.44,.386,base+.824,.798,.026,1.383,frame);
  box(rack,2.43,.405,base+1.274,.58,.028,.242,amber);
  box(rack,2.46,.426,base+1.296,.258,.022,.100,dark);
  for(let i=0;i<7;i++)box(rack,2.44,.408,base+.293+i*.052,.62,.026,.022,dark);
  box(rack,2.76,.423,base+.919,.032,.056,.153,bright);
  for(const x of [2.11,2.74])for(const y of [-.276,.276])foot(rack,x,y,base,.208,.172);
  pin(rack,[1.957,0,cabinetIn],X,.091,.079,blue);
  facts.heating={label,system:'ICRF 离子回旋射频加热',status,source:sparcReference,
    note:'三维显示一支代表性端口、同轴路径与射频源机柜。接口、路径和尺寸均为平台示意。',
    rows:[['公开资料版本','Creely 等，2023'],['公开频率及耦合功率','120 MHz · 最高 25 MW'],
      ['文献天线配置','7 对四带天线（14 副）'],['展示范围','一支代表性端口与外部设备']]};
  if(!reference)facts.heating.rows=[['展示范围','通用 ICRF 外形与外部连接']];
  finishParts();
  return {parts,facts,focus:p(1.55,0,base+.92).applyAxisAngle(Z,phi).add(anchor)};
}

export function buildNbiSystem(group,{anchor,phi,a}) {
  const status='自主研究示意 · 非 SPARC 基准';
  const kit=model(group,{anchor,phi,a},'nbi','NBI 中性束注入',beamReference,status);
  const {p,m,parts,facts,finishes:{steel,bright,frame,dark,blue,amber,bronze},addPart,box,turned,pin,
    collar,chamferedCase,cradle,finishParts}=kit;
  const z=1.03;
  const source=addPart('source','NBI 离子源与束源真空箱',[4.23,0,z],
    '展示离子源外壳、束源真空箱与落地支承。','离子源 → 加速组件',
    [['真空箱宽 × 高',`${m(.88)} × ${m(.86)}`]]);
  chamferedCase(source,4.25,0,z,.69,.88,.86,frame);
  chamferedCase(source,4.62,0,z,.066,.84,.83,steel);
  turned(source,[4.62,0,z],X,[[0,0],[0,.308],[.057,.308],[.107,.273],[.137,.194],[.137,0]],steel);
  collar(source,4.66,0,z,.32,.165,bright);
  for(const x of [4.06,4.37])chamferedCase(source,x,0,z,.049,.925,.906,steel);
  box(source,4.27,0,z+.49,.39,.52,.116,blue);
  cradle(source,4.28,z-.441,0,.88);

  const accelerator=addPart('accelerator','NBI 加速组件外罩',[3.49,0,z],
    '分段外壳连接束源和中性化器。','离子源 → 加速组件 → 中性化器',
    [['外罩长度',m(.68)],['展示内容','分段外壳与压接环']]);
  turned(accelerator,[3.14,0,z],X,[[0,0],[0,.174],[.091,.202],[.175,.274],[.542,.274],
    [.627,.302],[.764,.302],[.764,0]],dark);
  for(const x of [3.30,3.42,3.54,3.66])collar(accelerator,x,0,z,.286,.244,steel,0);
  collar(accelerator,3.90,0,z,.326,.262,bright);
  collar(accelerator,3.145,0,z,.270,.175,bright);
  cradle(accelerator,3.47,z-.301,0,.60);

  const neutralizer=addPart('neutralizer','NBI 中性化器',[2.77,0,z],
    '中性化器将部分高速离子转为中性粒子。此处展示外壳与连接件。','加速组件 → 中性化器 → 剩余离子收集',
    [['壳体长度',m(.75)]]);
  chamferedCase(neutralizer,2.77,0,z,.755,.64,.60,steel);
  for(const [x,side] of [[2.40,-1],[3.14,1]]){
    chamferedCase(neutralizer,x,0,z,.071,.72,.68,frame);
    for(const y of [-.278,.278])for(const h of [-.25,.25]){
      pin(neutralizer,[x+side*.043,y,z+h],X,.017,.018,dark,6);
    }
  }
  for(const y of [-.241,.241])box(neutralizer,2.77,y,z+.321,.61,.07,.048,bright);
  cradle(neutralizer,2.74,z-.331,0,.67);

  const dump=addPart('collector','NBI 剩余离子收集装置',[2.06,0,z],
    '用两侧收集箱标示去除剩余带电粒子的功能位置。','中性化器 → 剩余离子收集 → 漂移段',
    [['两侧外壳总宽',m(.99)]]);
  chamferedCase(dump,2.07,0,z,.62,.56,.49,dark);
  for(const y of [-.355,.355]){
    chamferedCase(dump,2.06,y,z,.488,.31,.478,bronze);
    box(dump,2.06,y,z+.252,.382,.245,.047,steel);
    for(const x of [1.89,2.22])box(dump,x,y,z-.24,.086,.26,.061,frame);
  }
  cradle(dump,2.06,z-.281,0,.89);

  const duct=addPart('duct','NBI 漂移管与隔离阀',[.85,0,z],
    '外围独立束线终端。法兰外侧保留可见间隔，注入通道未验证。',
    '剩余离子收集 → 漂移管 → 独立终端',[['示意漂移段长度',m(1.76)],['注入通道','未验证']]);
  turned(duct,[0,0,z],X,[[0,0],[0,.198],[.158,.202],[.215,.174],[1.16,.174],
    [1.32,.222],[1.76,.222],[1.76,0]],steel);
  for(const [x,r] of [[.015,.259],[.57,.224],[1.29,.267],[1.75,.273]])collar(duct,x,0,z,r,.146,bright);
  pin(duct,[-.022,0,z],X,.152,.016,dark);
  chamferedCase(duct,.625,0,z,.147,.492,.578,blue);
  pin(duct,[.625,0,z+.315],Z,.068,.099,steel);
  pin(duct,[.625,0,z+.418],Z,.103,.128,frame);
  cradle(duct,.32,z-.219,0,.51);cradle(duct,1.25,z-.235,0,.53);

  const calorimeter=addPart('calorimeter','NBI 调试量热器 · 停放位',[1.45,0,z+.56],
    '调试时用于截获束流并测量功率。模型展示束轴上方的停放位置。','测试组件 ↔ 漂移管侧支架',
    [['测试壳体宽 × 高',`${m(.50)} × ${m(.31)}`],['当前状态','停放在束轴上方']]);
  for(const y of [-.223,.223])box(calorimeter,1.46,y,z+.324,.10,.067,.483,frame);
  chamferedCase(calorimeter,1.45,0,z+.599,.285,.50,.31,amber);
  box(calorimeter,1.45,0,z+.756,.311,.534,.055,bright);
  for(const y of [-.136,.136])pin(calorimeter,[1.45,y,z+.781],Z,.038,.070,blue);

  const axis=new THREE.Group();
  axis.name='NBI direction outside the tokamak';
  const direction=new THREE.Line(new THREE.BufferGeometry().setFromPoints([p(-.10,0,z),p(-1.02,0,z)]),
    new THREE.LineDashedMaterial({color:0x9af1f4,dashSize:.10*a,gapSize:.062*a}));
  direction.computeLineDistances();
  direction.raycast=()=>{};
  axis.add(direction);
  const arrow=new THREE.Mesh(new THREE.ConeGeometry(.062*a,.153*a,12),
    new THREE.MeshBasicMaterial({color:0x9af1f4,transparent:true,depthWrite:false}));
  arrow.position.copy(p(-1.06,0,z));arrow.quaternion.setFromUnitVectors(Y,X.clone().negate());
  arrow.raycast=()=>{};
  axis.add(arrow);group.add(axis);
  facts.nbi={label:'NBI 中性束注入 · 非 SPARC 基准',system:'NBI 中性束注入',status,source:beamReference,
    note:'离子源、加速外罩、中性化器、剩余离子收集、漂移管和调试量热器构成外围独立装置。',
    rows:[['注入通道','未验证'],['束能、功率及沉积','未计算'],['模型来源','MITICA 功能组成参考 · 自主示意外形']]};
  for(const key of Object.keys(parts))facts[key].rows.push(['注入通道','未验证']);
  finishParts();
  return {parts,facts,axis,focus:p(2.05,0,z).applyAxisAngle(Z,phi).add(anchor)};
}
