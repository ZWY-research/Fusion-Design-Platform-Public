import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const xAxis=new THREE.Vector3(1,0,0), yAxis=new THREE.Vector3(0,1,0), up=new THREE.Vector3(0,0,1);
const pumpSource='https://www.grundfos.com/au/learn/ecademy/all-courses/grundfos-end-suction-pumps/introduction-to-end-suction-pumps';
const exchangerSource='https://www.alfalaval.com/en-US/products/heat-transfer/plate-heat-exchangers/gasketed-plate-and-frame-heat-exchangers/';

function route(points,radius) {
  const curve=new THREE.CurvePath();
  let start=points[0];
  for(let i=1;i<points.length-1;i++){
    const corner=points[i], before=points[i-1], after=points[i+1];
    const trim=Math.min(radius,corner.distanceTo(before)*.42,corner.distanceTo(after)*.42);
    const from=corner.clone().lerp(before,trim/corner.distanceTo(before));
    const to=corner.clone().lerp(after,trim/corner.distanceTo(after));
    curve.add(new THREE.LineCurve3(start,from));
    curve.add(new THREE.QuadraticBezierCurve3(from,corner,to));
    start=to;
  }
  curve.add(new THREE.LineCurve3(start,points.at(-1)));
  return curve;
}

function batchFinishes(group) {
  const byFinish=new Map();
  for(const mesh of group.children){
    if(!byFinish.has(mesh.material))byFinish.set(mesh.material,[]);
    byFinish.get(mesh.material).push(mesh);
  }
  for(const [finish,meshes] of byFinish){
    if(meshes.length===1)continue;
    const pieces=meshes.map(mesh=>{
      mesh.updateMatrix();
      const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
      if(geometry!==mesh.geometry)mesh.geometry.dispose();
      geometry.deleteAttribute('uv');
      return geometry.applyMatrix4(mesh.matrix);
    });
    group.remove(...meshes);
    group.add(new THREE.Mesh(mergeGeometries(pieces),finish));
    for(const piece of pieces)piece.dispose();
  }
}

export function buildCoolingSystem(group,{anchor,phi,a}) {
  group.position.copy(anchor);
  group.rotation.z=phi;
  const point=(x,y,z)=>new THREE.Vector3(x*a,y*a,z*a);
  const metres=value=>`${(value*a).toFixed(3)} m`;
  const parts={}, facts={};
  const metal=(color,roughness=.33,metalness=.74)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const steel=metal(0x9eafb8), dark=metal(0x33444c,.43), frame=metal(0x536b77,.42);
  const supply=metal(0x278baa,.33,.52), returning=metal(0xc77748,.36,.52);
  const paint=metal(0x365971,.39,.48), seam=metal(0x272e36,.6,.32);
  const arrowMaterial=new THREE.MeshBasicMaterial({color:0xe7f3f5,side:THREE.DoubleSide});
  const radius=.086;
  const supplyEnd=point(.77,-.51,.99), returnStart=point(.77,.67,.68);
  const valveIn=point(1.69,-.51,.99), valveOut=point(1.40,-.51,.99);
  const pumpIn=point(2.66,-.51,.40), pumpOut=point(2.93,-.51,.70);
  const hxIn=point(3.03,.67,1.07), hxOut=point(3.03,.27,.40);

  function component(id,label,location,note,connection,dimensions,source) {
    const root=new THREE.Group();
    root.name='cooling-'+id;
    group.add(root);parts[root.name]=root;
    const world=location.clone().applyAxisAngle(up,phi).add(anchor).toArray().map(value=>value.toFixed(3));
    facts[root.name]={label,system:'常规设备水冷',status:'研究示意 · 工程未验证',note,source,
      rows:[...dimensions,['参考位置 XYZ（m）',world.join(', ')],['连接',connection],
        ['模型来源',source?'典型构造参考 · 自主参数化':'自主参数化示意']]};
    return root;
  }
  function mesh(parent,name,geometry,finish,at) {
    const result=new THREE.Mesh(geometry,finish);
    result.name=name;
    if(at)result.position.copy(at);
    parent.add(result);
    return result;
  }
  function box(parent,name,l,w,h,finish,x,y,z) {
    return mesh(parent,name,new THREE.BoxGeometry(l*a,w*a,h*a),finish,point(x,y,z));
  }
  function revolved(parent,name,profile,at,axis,finish,segments=32) {
    const geometry=new THREE.LatheGeometry(profile.map(([s,r])=>new THREE.Vector2(r*a,s*a)),segments);
    const result=mesh(parent,name,geometry,finish,at);
    result.quaternion.setFromUnitVectors(yAxis,axis);
    return result;
  }
  function cylinder(parent,name,at,axis,r,length,finish,segments=24) {
    const result=mesh(parent,name,new THREE.CylinderGeometry(r*a,r*a,length*a,segments),finish,at);
    result.quaternion.setFromUnitVectors(yAxis,axis);
    return result;
  }
  function flange(parent,at,axis,r=.134) {
    const i=radius*.87;
    revolved(parent,'Machined flange',[[-.025,i],[-.025,r-.009],[-.016,r],[.016,r],[.025,r-.009],
      [.025,i],[-.025,i]],at,axis,steel);
    const side=axis===up?xAxis:yAxis, other=axis.clone().cross(side);
    for(let k=0;k<6;k++){
      const theta=(k+.5)*Math.PI/3, bolt=r-.019;
      const place=at.clone().addScaledVector(side,Math.cos(theta)*bolt*a)
        .addScaledVector(other,Math.sin(theta)*bolt*a).addScaledVector(axis,.027*a);
      cylinder(parent,'Flange bolt',place,axis,.013,.017,dark,6);
    }
  }
  function tube(parent,name,points,finish) {
    const curve=route(points,.18*a);
    return mesh(parent,name,new THREE.TubeGeometry(curve,Math.max(16,Math.ceil(curve.getLength()/a*20)),
      radius*a,16,false),finish);
  }
  function flowArrow(parent,x,y,z,direction) {
    const profile=[[-.09,-.018],[.009,-.018],[.009,-.043],[.096,0],[.009,.043],[.009,.018],[-.09,.018]];
    const shape=new THREE.Shape(profile.map(([px,py])=>new THREE.Vector2(px*a,py*a)));
    const mark=mesh(parent,'Static flow direction',new THREE.ShapeGeometry(shape),arrowMaterial,point(x,y,z+radius+.003));
    mark.rotation.z=direction===1?0:Math.PI;
  }
  function stand(parent,x,y,z) {
    const saddle=z-.113;
    cylinder(parent,'Pipe clamp',point(x,y,z),xAxis,.105,.080,steel);
    box(parent,'Clamp saddle',.138,.29,.060,frame,x,y,saddle);
    for(const offset of [-.103,.103]){
      box(parent,'Stand post',.061,.061,saddle-.017,dark,x,y+offset,(saddle+.017)/2);
      box(parent,'Stand anchor foot',.175,.13,.038,steel,x,y+offset,.019);
    }
  }
  function foot(parent,x,y,l,w) {
    box(parent,'Ground anchor plate',l,w,.039,steel,x,y,.0195);
  }

  const blue=component('supply','供水主管 · 蓝色',point(1.98,-.51,.99),
    '接收循环泵出口的流体并送往示意负载。静态箭头表示拓扑方向，颜色用于识别。',
    '循环泵 → 隔离阀 → 示意负载',[['管道外径',metres(2*radius)],['流向','沿径向向内']]);
  tube(blue,'Supply from pump',[pumpOut,point(2.93,-.51,.99),valveIn],supply);
  tube(blue,'Supply to load',[valveOut,supplyEnd],supply);
  flange(blue,supplyEnd,xAxis);
  stand(blue,1.91,-.51,.99);
  for(const x of [1.03,2.25,2.54])flowArrow(blue,x,-.51,.99,-1);

  const orange=component('return','回水主管 · 暖色',point(2.24,.67,1.07),
    '将示意负载的回水送至板式换热器。静态箭头表示拓扑方向，颜色用于识别。',
    '示意负载 → 换热器一次侧入口',[['管道外径',metres(2*radius)],['流向','沿径向向外']]);
  tube(orange,'Return from load',[returnStart,point(1.70,.67,.68),point(1.70,.67,1.07),hxIn],returning);
  stand(orange,2.22,.67,1.07);
  for(const [x,z] of [[1.21,.68],[2.46,1.07],[2.77,1.07]])flowArrow(orange,x,.67,z,1);
  flange(orange,returnStart,xAxis);flange(orange,hxIn,xAxis);

  const load=component('load','常规设备示意负载',point(.43,.10,.56),
    '独立的带支脚负载外壳，侧面各有供水入口和回水出口。',
    '供水入口 → 示意负载 → 回水出口',
    [['箱体宽 × 高',`${metres(1.56)} × ${metres(1.08)}`],['接口','蓝色入口 · 暖色出口']]);
  box(load,'Equipment casing',.49,1.56,1.08,dark,.40,.08,.616);
  box(load,'Enclosure front cover',.060,1.46,.94,frame,.655,.08,.622);
  box(load,'Bolted top plate',.53,1.59,.049,steel,.40,.08,1.165);
  for(const y of [-.57,.73]){
    box(load,'Equipment pedestal',.48,.110,.069,frame,.40,y,.057);
    foot(load,.40,y,.56,.172);
  }
  for(const z of [.30,.37,.44])box(load,'Vent slots',.012,.52,.020,seam,.688,.08,z);
  for(const [end,finish] of [[supplyEnd,supply],[returnStart,returning]]){
    cylinder(load,'Load cooling union',end.clone().addScaledVector(xAxis,-.064*a),xAxis,.109,.13,finish);
  }

  const valve=component('valve','供水隔离阀',valveIn.clone().lerp(valveOut,.5),
    '双法兰隔离阀和顶部手柄的安装示意。','循环泵出口段 → 负载供水段',
    [['端面间距',metres(.29)],['安装方向','径向水平']]);
  const valveCenter=valveIn.clone().lerp(valveOut,.5);
  revolved(valve,'Butterfly valve body',[[-.145,0],[-.145,.093],[-.094,.093],[-.067,.147],
    [.067,.147],[.094,.093],[.145,.093],[.145,0]],valveCenter,xAxis,paint);
  flange(valve,valveIn,xAxis,.143);flange(valve,valveOut,xAxis,.143);
  cylinder(valve,'Valve stem',valveCenter.clone().addScaledVector(up,.168*a),up,.034,.092,steel);
  box(valve,'Manual lever',.25,.055,.042,returning,1.49,-.51,1.21);

  const pump=component('pump','循环离心泵',point(2.93,-.51,.40),
    '典型端吸泵外形，包含泵壳、上排口、联轴器护罩和带散热筋的水平电机。',
    '换热器一次侧出口 → 泵轴向入口 → 供水主管',[['泵壳外径',metres(.42)],['轴向','沿径向水平']],pumpSource);
  const volute=point(2.93,-.51,.40);
  revolved(pump,'Centrifugal volute',[[-.27,0],[-.27,.105],[-.183,.107],[-.132,.19],
    [-.092,.211],[.075,.211],[.119,.174],[.155,.112],[.170,.112],[.170,0]],volute,xAxis,paint);
  flange(pump,pumpIn,xAxis);flange(pump,pumpOut,up);
  cylinder(pump,'Radial discharge neck',point(2.93,-.51,.613),up,.104,.174,supply);
  cylinder(pump,'Coupling guard',point(3.16,-.51,.40),xAxis,.116,.184,steel);
  revolved(pump,'Motor shell',[[0,0],[0,.132],[.068,.158],[.38,.158],[.421,.119],[.421,0]],
    point(3.25,-.51,.40),xAxis,frame);
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6;
    const fin=box(pump,'Axial motor fin',.301,.035,.027,steel,3.47,-.51-.162*Math.sin(angle),.40+.162*Math.cos(angle));
    fin.rotation.x=angle;
  }
  box(pump,'Motor terminal cover',.194,.172,.071,paint,3.47,-.51,.571);
  box(pump,'Pump mount',.28,.27,.122,frame,2.93,-.51,.153);
  box(pump,'Motor mount',.30,.27,.158,frame,3.49,-.51,.170);
  box(pump,'Pump skid',1.10,.57,.084,dark,3.23,-.51,.071);
  for(const x of [2.74,3.72])foot(pump,x,-.51,.165,.59);

  const hx=component('exchanger','板式换热设备',point(3.46,.47,.76),
    '压紧板、板片组和拉杆表征板式设备。一次侧接入回路，二次侧接口使用示意封盖。',
    '回水主管 → 换热器一次侧 → 循环泵',[['压紧框宽 × 高',`${metres(.74)} × ${metres(1.24)}`],
      ['一次侧接口','上进 · 下出']],exchangerSource);
  box(hx,'Fixed frame',.094,.74,1.24,paint,3.135,.47,.76);
  box(hx,'Pressure plate',.102,.74,1.24,paint,3.727,.47,.76);
  for(let i=0;i<13;i++)box(hx,'Heat exchanger plate',.023,.618,1.113,i%2?frame:steel,3.203+i*.040,.47,.755);
  for(const y of [.10,.84])for(const z of [.28,.76,1.24]){
    cylinder(hx,'Clamping tie rod',point(3.428,y,z),xAxis,.024,.730,steel,12);
    for(const x of [3.066,3.79])cylinder(hx,'Tie rod nut',point(x,y,z),xAxis,.040,.039,dark,6);
  }
  for(const end of [hxIn,hxOut]){
    cylinder(hx,'Primary port neck',end.clone().addScaledVector(xAxis,.038*a),xAxis,.10,.084,steel);
  }
  for(const [y,z] of [[.27,1.07],[.67,.40]]){
    cylinder(hx,'Secondary sealed port',point(3.054,y,z),xAxis,.088,.079,frame);
    cylinder(hx,'Secondary blind cap',point(3.005,y,z),xAxis,.102,.029,steel);
  }
  tube(hx,'Exchanger to pump',[hxOut,point(2.10,.27,.40),point(2.10,-.51,.40),pumpIn],supply);
  flange(hx,hxOut,xAxis);
  for(const x of [3.14,3.73]){
    box(hx,'Exchanger support shoe',.14,.68,.12,frame,x,.47,.095);
    foot(hx,x,.47,.236,.79);
  }

  facts.cooling={label:'设备水冷',system:'常规设备水冷',status:'研究示意 · 工程未验证',
    note:'独立的常规设备循环。以蓝色、暖色和静态箭头识别供回水，配置为自主参数化展示。',
    rows:[['连接','循环泵 → 供水 → 示意负载 → 回水 → 板式换热设备 → 循环泵'],
      ['布置','沿用原水冷图层所在扇区'],['主线外径',metres(2*radius)]]};
  for(const root of Object.values(parts))batchFinishes(root);
  return {parts,facts,stationCenter:point(2.5,0,.5).applyAxisAngle(up,phi).add(anchor)};
}
