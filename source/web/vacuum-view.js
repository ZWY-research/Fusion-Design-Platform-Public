import * as THREE from 'three';

const axisX = new THREE.Vector3(1,0,0);
const axisY = new THREE.Vector3(0,1,0);
const up = new THREE.Vector3(0,0,1);
const down = up.clone().negate();
const v = (x,y,z) => new THREE.Vector3(x,y,z);
const typicalSource = 'https://www.leybold.com/en/products/systems-and-solutions/high-vacuum-pump-systems/TURBOLAB-pumping-station';

function finishes() {
  const metal = (color,roughness=.3,metalness=.80) => new THREE.MeshStandardMaterial({color,roughness,metalness});
  return {
    steel:metal(0x8da4af), machined:metal(0xbdc9ce,.26), oxide:metal(0x4d6774,.42),
    valve:metal(0x34657a,.38,.58), dark:metal(0x27343c,.49,.55), seal:metal(0x171e24,.7,.05),
  };
}

function add(parent,name,geometry,finish,center) {
  const item = new THREE.Mesh(geometry,finish);
  item.name = name;
  if(center)item.position.copy(center);
  parent.add(item);
  return item;
}

function turned(parent,name,profile,at,direction,finish,segments=40) {
  const surface = new THREE.LatheGeometry(profile.map(([s,r])=>new THREE.Vector2(r,s)),segments);
  const item = add(parent,name,surface,finish,at);
  item.quaternion.setFromUnitVectors(axisY,direction);
  return item;
}

function flange(parent,center,direction,s,bore,outer,finish) {
  const depth=.071*s, bevel=.009*s, half=depth/2;
  turned(parent,'Beveled bolted flange',[
    [-half,bore],[-half,outer-bevel],[-half+bevel,outer],[half-bevel,outer],
    [half,outer-bevel],[half,bore],[-half,bore],
  ],center,direction,finish.machined);
  const normal = Math.abs(direction.z)>.98?axisX:up;
  const tangent = normal.clone().cross(direction).normalize();
  const radial = direction.clone().cross(tangent);
  const boltCircle = (outer+bore)/2;
  for(let i=0;i<6;i++){
    const angle = (i+.5)*Math.PI/3;
    const at = center.clone().addScaledVector(tangent,Math.cos(angle)*boltCircle)
      .addScaledVector(radial,Math.sin(angle)*boltCircle).addScaledVector(direction,half);
    spindle(parent,'Hex flange bolt',at,direction,.016*s,.014*s,finish.oxide,6);
  }
}

function spindle(parent,name,center,direction,radius,length,finish,segments=32) {
  const item = add(parent,name,new THREE.CylinderGeometry(radius,radius,length,segments),finish,center);
  item.quaternion.setFromUnitVectors(axisY,direction);
  return item;
}

function bar(parent,name,start,end,width,depth,finish) {
  const d = end.clone().sub(start);
  const item = add(parent,name,new THREE.BoxGeometry(width,d.length(),depth),finish,start.clone().lerp(end,.5));
  item.quaternion.setFromUnitVectors(axisY,d.normalize());
  return item;
}

function elbow(start,end,entry,exit,radius,angle) {
  const k = 4/3*radius*Math.tan(angle/4);
  return new THREE.CubicBezierCurve3(start,start.clone().addScaledVector(entry,k),
    end.clone().addScaledVector(exit,-k),end);
}

function routedTube(parent,name,curves,radius,finish) {
  const path = new THREE.CurvePath();
  for(const curve of curves)path.add(curve);
  const segments = Math.max(24,Math.ceil(path.getLength()/radius*1.5));
  return add(parent,name,new THREE.TubeGeometry(path,segments,radius,18,false),finish);
}

function gateBody(parent,center,direction,s,finish) {
  const w=.234*s, lo=-.229*s, hi=.348*s, b=.064*s, thickness=.216*s;
  const shape = new THREE.Shape([
    [-w+b,lo],[w-b,lo],[w,lo+b],[w,hi-b],[w-b,hi],[-w+b,hi],[-w,hi-b],[-w,lo+b],
  ].map(point=>new THREE.Vector2(...point)));
  const geometry = new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelThickness:.009*s,
    bevelSize:.009*s,bevelSegments:1,steps:1}).translate(0,0,-thickness/2);
  const casing = add(parent,'Gate valve casing',geometry,finish.valve,center);
  const across = up.clone().cross(direction);
  casing.setRotationFromMatrix(new THREE.Matrix4().makeBasis(across,up,direction));
  for(const face of [-1,1])for(const side of [-1,1])for(const height of [-.176,.24]){
    const bolt=center.clone().addScaledVector(direction,face*(thickness/2+.009*s))
      .addScaledVector(across,side*.17*s).addScaledVector(up,height*s);
    spindle(parent,'Valve cover fastener',bolt,direction,.018*s,.014*s,finish.machined,6);
  }
  const top = center.clone().addScaledVector(up,.343*s);
  const plate = add(parent,'Valve bonnet',new THREE.BoxGeometry(.32*s,.30*s,.062*s),finish.machined,top);
  plate.rotation.z = Math.atan2(direction.y,direction.x);
  spindle(parent,'Actuator stem housing',top.clone().addScaledVector(up,.085*s),up,.065*s,.13*s,finish.steel);
  turned(parent,'Vertical actuator',[[0,0],[0,.11*s],[.045*s,.143*s],[.228*s,.143*s],
    [.257*s,.112*s],[.257*s,0]],top.clone().addScaledVector(up,.124*s),up,finish.oxide);
  spindle(parent,'Actuator cap',top.clone().addScaledVector(up,.383*s),up,.114*s,.041*s,finish.dark);
}

function pumpSkid(parent,turbo,backing,floor,s,finish) {
  const minX=turbo.x-.40*s, maxX=backing.x+.39*s;
  const minY=turbo.y-.78*s, maxY=turbo.y+.37*s;
  const beamZ=floor+.094*s;
  for(const y of [minY,maxY])bar(parent,'Longitudinal skid rail',v(minX,y,beamZ),v(maxX,y,beamZ),
    .12*s,.115*s,finish.oxide);
  for(const x of [minX+.065*s,maxX-.065*s]){
    bar(parent,'Skid crossmember',v(x,minY,beamZ),v(x,maxY,beamZ),.11*s,.11*s,finish.oxide);
    for(const y of [minY,maxY])add(parent,'Skid anchor plate',new THREE.BoxGeometry(.23*s,.22*s,.037*s),
      finish.steel,v(x,y,floor+.0185*s));
  }
  add(parent,'Common pump mounting deck',new THREE.BoxGeometry(maxX-minX,maxY-minY+.10*s,.060*s),
    finish.steel,v((minX+maxX)/2,(minY+maxY)/2,floor+.173*s));
}

export function buildVacuumSystem(group,{anchor,phi,a:s,floor,portDiameter}) {
  const finish = finishes();
  const parts={}, facts={};
  group.position.copy(anchor);
  group.rotation.z=phi;
  const metres = length => `${length.toFixed(3)} m`;
  const worldAt = point => point.clone().applyAxisAngle(up,phi).add(anchor).toArray().map(n=>n.toFixed(3)).join(', ');
  function part(key,label,position,sizeRows,links,note,source) {
    const id='vacuum-'+key, root=new THREE.Group();
    root.name=id;
    group.add(root);
    parts[id]=root;
    facts[id]={label,system:'真空抽气',status:'研究示意 · 工程未验证',note,source,
      rows:[...sizeRows,['位置 XYZ（m）',worldAt(position)],['连接',links],
        ['模型来源',source?'典型泵组配置 · 自主外形':'平台接口与自主参数化几何']]};
    return root;
  }
  const bore=.095*s, pipeRadius=.113*s, flangeRadius=.175*s;
  const outlet=v(.255*s,0,0), elbowStart=v(.98*s,0,0);
  const turnAngle=Math.PI/4, elbowRadius=.49*s;
  const direction=v(Math.cos(turnAngle),-Math.sin(turnAngle),0);
  const elbowEnd=elbowStart.clone().add(v(elbowRadius*Math.sin(turnAngle),-elbowRadius*(1-Math.cos(turnAngle)),0));
  const valveStart=elbowEnd.clone().addScaledVector(direction,.31*s);
  const valveEnd=valveStart.clone().addScaledVector(direction,.37*s);
  const valveCenter=valveStart.clone().lerp(valveEnd,.5);
  const bellowsEnd=valveEnd.clone().addScaledVector(direction,.47*s);
  const riserStart=bellowsEnd.clone().addScaledVector(direction,.35*s);
  const dropRadius=.42*s;
  const riserEdge=riserStart.clone().addScaledVector(direction,dropRadius).addScaledVector(up,-dropRadius);
  const inlet=v(riserEdge.x,riserEdge.y,floor+1.016*s);
  const motorBase=v(inlet.x,inlet.y,floor+.231*s);
  const backing=v(inlet.x+.77*s,inlet.y-.44*s,floor+.425*s);

  const port=part('port','抽气端口',v(0,0,0),
    [['既有接管外径',metres(portDiameter)],['法兰外径',metres(2*flangeRadius)]],'真空室外壁 → 抽气管道',
    '研究示意。沿用原抽气图层的方位、标高及接管直径，以过渡接管贴合现有壳体外表面。');
  const portR=portDiameter/2;
  turned(port,'Vessel saddle collar',[[-.023*s,0],[-.023*s,.133*s],[.019*s,.133*s],[.043*s,.098*s],
    [.071*s,.098*s],[.071*s,0]],v(0,0,0),axisX,finish.oxide);
  turned(port,'Reduced vacuum nozzle',[[.022*s,0],[.022*s,portR],[.086*s,portR],[.182*s,pipeRadius],
    [.279*s,pipeRadius],[.279*s,0]],v(0,0,0),axisX,finish.steel);
  flange(port,outlet,axisX,s,bore,flangeRadius,finish);

  const tube=part('pipe','抽气管道',elbowStart,[['管道外径',metres(2*pipeRadius)],
    ['转向半径',`${metres(elbowRadius)} / ${metres(dropRadius)}`]],'抽气端口 → 隔离阀；波纹管 → 主泵',
    '实体外壳由径向直管、平面弯头和向下的入口立管连接。管夹和支架沿同一坐标定位。');
  const firstBend=elbow(elbowStart,elbowEnd,axisX,direction,elbowRadius,turnAngle);
  const dropBend=elbow(riserStart,riserEdge,direction,down,dropRadius,Math.PI/2);
  routedTube(tube,'Horizontal suction pipe',[new THREE.LineCurve3(outlet,elbowStart),firstBend,
    new THREE.LineCurve3(elbowEnd,valveStart)],pipeRadius,finish.steel);
  routedTube(tube,'Vertical pump inlet pipe',[new THREE.LineCurve3(bellowsEnd,riserStart),dropBend,
    new THREE.LineCurve3(riserEdge,inlet)],pipeRadius,finish.steel);
  flange(tube,valveStart,direction,s,bore,flangeRadius,finish);
  flange(tube,bellowsEnd,direction,s,bore,flangeRadius,finish);
  const standX=.86*s;
  spindle(tube,'Pipe clamp',v(standX,0,0),axisX,.137*s,.075*s,finish.oxide);
  for(const y of [-.165*s,.165*s]){
    bar(tube,'Pipe stand upright',v(standX,y,floor+.035*s),v(standX,y,-.139*s),.085*s,.077*s,finish.oxide);
    add(tube,'Pipe stand foot',new THREE.BoxGeometry(.22*s,.19*s,.042*s),finish.steel,v(standX,y,floor+.021*s));
  }
  bar(tube,'Pipe clamp saddle',v(standX,-.25*s,-.126*s),v(standX,.25*s,-.126*s),.14*s,.077*s,finish.oxide);
  bar(tube,'Pipe stand brace',v(standX,-.16*s,floor+.18*s),v(standX,.16*s,-.22*s),.053*s,.055*s,finish.oxide);

  const valve=part('valve','真空隔离阀',valveCenter,[['端面间距',metres(valveStart.distanceTo(valveEnd))],
    ['执行机构','竖直安装']], '抽气管道 → 柔性波纹管','闸阀阀体与外置执行机构，展示接口和安装方向。');
  spindle(valve,'Valve through-body',valveCenter,direction,pipeRadius,valveStart.distanceTo(valveEnd),finish.steel);
  gateBody(valve,valveCenter,direction,s,finish);
  flange(valve,valveEnd,direction,s,bore,flangeRadius,finish);

  const bellows=part('bellows','金属柔性波纹管',valveEnd.clone().lerp(bellowsEnd,.5),
    [['端面间距',metres(valveEnd.distanceTo(bellowsEnd))],['褶皱数','8']], '隔离阀 → 主泵入口立管',
    '以连续回转轮廓表现柔性金属连接件和两端法兰。');
  const folds=[[0,bore],[0,pipeRadius],[.054*s,pipeRadius]];
  for(let j=0;j<=64;j++){
    const t=j/64;
    folds.push([(.060+.346*t)*s,(.115+.037*(.5-.5*Math.cos(16*Math.PI*t)))*s]);
  }
  folds.push([.470*s,pipeRadius],[.470*s,bore],[0,bore]);
  turned(bellows,'Eight bellows convolutions',folds,valveEnd,direction,finish.machined);
  for(const [p,normal] of [[valveEnd,direction],[bellowsEnd,direction.clone().negate()]]){
    const seam=p.clone().addScaledVector(normal,.041*s);
    spindle(bellows,'Bellows collar',seam,direction,.147*s,.024*s,finish.oxide);
  }

  const pumps=part('pumps','真空泵组',inlet,[['主泵壳外径',metres(.49*s)],['前级管外径',metres(.072*s)]],
    '入口立管 → 涡轮分子泵 → 前级泵','采用竖装涡轮分子泵与典型干式前级泵的示意组合。',typicalSource);
  flange(pumps,inlet,up,s,bore,flangeRadius,finish);
  turned(pumps,'Turbomolecular pump housing',[[0,0],[0,.136*s],[.058*s,.181*s],[.148*s,.181*s],
    [.206*s,.220*s],[.574*s,.220*s],[.618*s,.245*s],[.661*s,.245*s],
    [.716*s,.142*s],[.785*s,.142*s],[.785*s,0]],motorBase,up,finish.steel);
  for(let i=0;i<5;i++)spindle(pumps,'Pump cooling ring',motorBase.clone().addScaledVector(up,(.234+i*.068)*s),
    up,.237*s,.024*s,finish.oxide);
  spindle(pumps,'Turbo motor can',motorBase.clone().addScaledVector(up,.083*s),up,.147*s,.155*s,finish.dark);
  spindle(pumps,'Turbo mounting shoe',motorBase.clone(),up,.231*s,.056*s,finish.oxide);
  turned(pumps,'Forepump motor and scroll housing',[[-.31*s,0],[-.31*s,.142*s],[-.255*s,.183*s],
    [.047*s,.183*s],[.092*s,.224*s],[.233*s,.224*s],[.290*s,.15*s],[.290*s,0]],backing,axisX,finish.valve);
  for(let i=0;i<5;i++)spindle(pumps,'Forepump motor fin',backing.clone().addScaledVector(axisX,(-.22+.046*i)*s),
    axisX,.194*s,.018*s,finish.oxide);
  spindle(pumps,'Forepump cover',backing.clone().addScaledVector(axisX,.273*s),axisX,.176*s,.043*s,finish.steel);
  for(const x of [-.193*s,.144*s])add(pumps,'Forepump mounting foot',new THREE.BoxGeometry(.14*s,.32*s,.064*s),
    finish.oxide,v(backing.x+x,backing.y,floor+.235*s));
  const foreOutlet=v(inlet.x+.207*s,inlet.y-.08*s,floor+.60*s);
  const foreInlet=v(backing.x+.15*s,backing.y,backing.z+.205*s);
  const foreline=new THREE.CatmullRomCurve3([foreOutlet,foreOutlet.clone().addScaledVector(axisX,.22*s),
    foreInlet.clone().addScaledVector(up,.17*s),foreInlet]);
  routedTube(pumps,'Forevacuum connection',[foreline],.036*s,finish.steel);
  spindle(pumps,'Turbo foreline union',foreOutlet.clone().addScaledVector(axisX,.021*s),
    axisX,.062*s,.049*s,finish.oxide,12);
  spindle(pumps,'Foreline union',foreInlet,up,.071*s,.055*s,finish.machined,12);
  pumpSkid(pumps,inlet,backing,floor,s,finish);

  facts.vacuum={label:'真空抽气',system:'真空抽气',status:'典型设备配置 · 工程未验证',
    note:'原抽气方位上的研究示意，两级泵组采用典型配置。',source:typicalSource,
    rows:[['接口 XYZ（m）',worldAt(v(0,0,0))],['连接','抽气端口 → 管道 → 隔离阀 → 波纹管 → 泵组']]};
  return {parts,facts,pumpCenter:inlet.clone().applyAxisAngle(up,phi).add(anchor)};
}
