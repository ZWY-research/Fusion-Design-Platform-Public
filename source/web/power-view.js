import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const sparcSource='https://blog.cfs.energy/cfs-prepares-sparcs-fusion-support-systems-for-dress-rehearsal/';
const industrialSource='https://www.rittal.com/com-en/ebook/technical_system_catalogue/power_distribution/ri4power/pubData/SEO/Page_25.html';
const up=new THREE.Vector3(0,0,1);

// Keep each selectable assembly separate while batching its repeated hardware.
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
      return mesh.geometry.applyMatrix4(mesh.matrix);
    });
    group.remove(...meshes);
    group.add(new THREE.Mesh(mergeGeometries(pieces),finish));
    for(const piece of pieces)piece.dispose();
  }
}

export function buildPowerSystem(group,{anchor,phi,a}) {
  group.position.copy(anchor);
  group.rotation.z=phi;
  const point=(x,y,z)=>new THREE.Vector3(x*a,y*a,z*a);
  const xyz=(x,y,z)=>point(x,y,z).applyAxisAngle(up,phi).add(anchor).toArray().map(n=>n.toFixed(3)).join(', ');
  const metres=(...values)=>values.map(n=>(n*a).toFixed(3)).join(' × ')+' m';
  const parts={}, facts={};
  const metal=(color,roughness=.38,metalness=.68)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const finish={
    shell:metal(0x9aa7aa,.42,.53), steel:metal(0xbac5c8,.32), frame:metal(0x46535e,.42),
    seal:metal(0x1b2228,.69,.16), panel:metal(0x526675,.45,.45), tf:metal(0xb3bbb5,.45,.48),
    pf:metal(0x8faaa9,.43,.49), distribution:metal(0xa5aebc,.45,.49),
    trim:metal(0xbaa572,.40,.49), copper:metal(0xc77d4f,.30,.77), ceramic:metal(0xc0beb0,.33,.11),
    terminal:metal(0x845245,.43,.32)
  };
  const status='研究示意 · 工程未验证';
  const system='电源系统';
  function component(id,label,position,note,connection,dimensions,source=industrialSource) {
    const root=new THREE.Group();
    root.name=id;
    group.add(root);
    parts[id]=root;
    facts[id]={label,system,status,note,source,rows:[
      ...dimensions,['参考位置 XYZ（m）',xyz(...position)],['连接对象',connection],
      ['模型来源','自主参数化 · 典型工业构造参考']
    ]};
    return root;
  }
  function mesh(parent,name,geometry,material,x,y,z) {
    const result=new THREE.Mesh(geometry,material);
    result.name=name;
    result.position.copy(point(x,y,z));
    parent.add(result);
    return result;
  }
  function box(parent,name,l,w,h,material,x,y,z) {
    return mesh(parent,name,new THREE.BoxGeometry(l*a,w*a,h*a),material,x,y,z);
  }
  function pin(parent,name,r,h,material,x,y,z,segments=16) {
    const result=mesh(parent,name,new THREE.CylinderGeometry(r*a,r*a,h*a,segments),material,x,y,z);
    result.rotation.x=Math.PI/2;
    return result;
  }
  function bolts(parent,x,y,z,sx,sy) {
    for(const dx of [-sx,sx])for(const dy of [-sy,sy])pin(parent,'Hex fastener',.024,.014,finish.steel,x+dx,y+dy,z,6);
  }
  function louvres(parent,x,y,z,width,count) {
    box(parent,'Recessed ventilation grille',width,.023,count*.040+.036,finish.seal,x,y,z);
    for(let i=0;i<count;i++){
      const slat=box(parent,'Formed louvre',width-.040,.028,.018,finish.frame,x,y-.016,z+(i-(count-1)/2)*.04);
      slat.rotation.x=.28;
    }
  }
  const cabinetY=.43, intakeY=.75, trayY=1.18, trayZ=2.72;
  const cabinets=[
    {id:'power-pfcs',label:'PF/CS 电源柜',x:.84,w:1.06,d:.88,h:2.42,doors:2,paint:finish.pf,outputs:[.43,.58],busZ:2.92,
      note:'双舱门和独立模块面板示意 PF/CS 设备的分组外观。',connection:'配电桥架进线 · PF/CS 双排母线至独立示意端子'},
    {id:'power-tf',label:'TF 电源柜',x:2.04,w:.95,d:.88,h:2.54,doors:1,paint:finish.tf,outputs:[.08,.23],busZ:3.08,
      note:'重型单舱柜以检修面板和通风段表现 TF 供电功率单元。',connection:'配电桥架进线 · TF 双排母线至独立示意端子'},
    {id:'power-distribution',label:'基础配电柜',x:3.14,w:.86,d:.81,h:2.23,doors:2,paint:finish.distribution,outputs:[],
      note:'封闭式配电外壳带维护面板和进出线口。',connection:'外围进线接口 · 封闭桥架分支至 TF 与 PF/CS 柜'}
  ];
  for(const {id,label,x,w,d,h,doors,paint,outputs,note,connection} of cabinets){
    const root=component(id,label,[x,cabinetY,0],note,connection,[['柜体宽 × 深 × 高（示意）',metres(w,d,h)]]);
    const front=cabinetY-d/2, rear=cabinetY+d/2;
    box(root,'Floor plinth',w+.10,d+.10,.065,finish.frame,x,cabinetY,.0325);
    box(root,'Recessed toe kick',w-.035,d-.035,.12,finish.seal,x,cabinetY,.125);
    const shellTop=h-.039;
    box(root,'Cabinet enclosure',w,d,shellTop-.18,finish.shell,x,cabinetY,(shellTop+.18)/2);
    box(root,'Roof cap',w+.03,d+.03,.039,finish.steel,x,cabinetY,h-.0195);
    box(root,'Door gasket plane',w-.06,.026,h-.27,finish.seal,x,front-.012,(h+.18)/2);
    box(root,'Rear service cover',w-.13,.026,h-.33,finish.panel,x,rear+.014,(h+.19)/2);
    box(root,'Header panel',w-.08,.035,.19,finish.panel,x,front-.031,h-.151);
    box(root,'Identification plate',.21,.014,.077,finish.trim,x,front-.055,h-.156);
    for(const sign of [-1,1]){
      box(root,'Vertical frame rail',.047,.04,h-.21,finish.frame,x+sign*(w-.044)/2,front-.013,(h+.16)/2);
      box(root,'Recessed side cover',.018,d-.12,h-.32,paint,x+sign*(w/2+.009),cabinetY,(h+.17)/2);
      for(const side of [-1,1])pin(root,'Floor anchor',.027,.015,finish.steel,x+sign*(w/2+.018),cabinetY+side*(d/2+.016),.070,6);
    }
    const leaf=(w-.115)/doors;
    for(let i=0;i<doors;i++){
      const dx=x+(i-(doors-1)/2)*leaf;
      box(root,'Access door',leaf-.027,.046,h-.49,paint,dx,front-.034,h/2+.003);
      box(root,'Power module access panel',leaf-.082,.045,.36,finish.panel,dx,front-.059,h-.61);
      box(root,'Recessed access handle',.05,.046,.189,finish.seal,dx+leaf*.33,front-.060,h*.49);
      box(root,'Latch grip',.025,.025,.128,finish.steel,dx+leaf*.33,front-.088,h*.49);
      for(const z of [.62,h-.41])box(root,'Door hinge',.051,.054,.10,finish.frame,dx-leaf*.46,front-.049,z);
      louvres(root,dx,front-.067,.60,leaf-.112,8);
      if(doors===1)louvres(root,dx,front-.067,h-.97,leaf-.15,5);
    }
    pin(root,'Cable gland plate',.091,.028,finish.frame,x,intakeY,h+.014);
    pin(root,'Cable gland fitting',.055,.071,finish.steel,x,intakeY,h+.059,12);
    for(const y of outputs){
      box(root,'Output mounting pad',.16,.11,.024,finish.steel,x,y,h+.012);
      pin(root,'Insulated output feedthrough',.042,.080,finish.terminal,x,y,h+.061);
      box(root,'Output terminal',.13,.066,.035,finish.copper,x,y,h+.113);
    }
    batchFinishes(root);
  }

  const busStart=.09, busWidth=.059, busThickness=.037, trayEnd=3.66;
  const bus=component('power-bus','实体母线及电缆桥架',[busStart,.34,0],
    '封闭桥架为配电连线示意。铜色双排分别表示 TF 和 PF/CS 出线，止于外围端子排。',
    '配电柜 → 桥架 → TF／PF/CS 电源柜 → 各自的外围示意端子',
    [['单根母线宽 × 厚（示意）',metres(busWidth,busThickness)],
      ['最长出线水平段（示意）',metres(cabinets[1].x-busStart)],
      ['桥架宽 × 高（示意）',metres(.185,.110)]]);
  const trayStart=cabinets[0].x-.12;
  const trayMiddle=(trayStart+trayEnd)/2, trayLength=trayEnd-trayStart;
  box(bus,'Main cable tray channel',trayLength,.17,.090,finish.frame,trayMiddle,trayY,trayZ);
  for(const sign of [-1,1])box(bus,'Tray edge rail',trayLength,.017,.10,finish.steel,trayMiddle,trayY+sign*.082,trayZ);
  box(bus,'Cable tray lid',trayLength,.185,.020,finish.panel,trayMiddle,trayY,trayZ+.050);
  box(bus,'External feed blanking plate',.025,.185,.110,finish.steel,trayEnd,trayY,trayZ);
  for(const x of [1.46,3.54]){
    box(bus,'Tray support anchor plate',.23,.27,.036,finish.frame,x,trayY,.018);
    box(bus,'Tray support post',.081,.092,trayZ-.045,finish.frame,x,trayY,(trayZ-.045)/2);
    box(bus,'Tray support saddle',.20,.27,.056,finish.steel,x,trayY,trayZ-.071);
    bolts(bus,x,trayY,.040,.078,.093);
  }
  for(const {x,h,outputs,busZ} of cabinets){
    box(bus,'Cable tray tee',.14,trayY-intakeY,.078,finish.frame,x,(trayY+intakeY)/2,trayZ);
    box(bus,'Cable tray branch lid',.16,trayY-intakeY+.08,.018,finish.steel,x,(trayY+intakeY)/2,trayZ+.047);
    const drop=trayZ-h-.085;
    box(bus,'Cabinet cable drop',.087,.087,drop,finish.frame,x,intakeY,trayZ-drop/2);
    for(const y of outputs){
      box(bus,'Solid copper busbar',x-busStart+.10,busWidth,busThickness,finish.copper,(x+busStart)/2,y,busZ);
      box(bus,'Bolted vertical copper link',.074,busWidth,busZ-h-.09,finish.copper,x,y,(busZ+h+.09)/2);
      box(bus,'End terminal palm',.14,.079,.040,finish.copper,busStart+.034,y,busZ);
      pin(bus,'Busbar joint fastener',.021,.014,finish.steel,x,y,busZ+.024,6);
      pin(bus,'Terminal fastener',.021,.014,finish.steel,busStart+.034,y,busZ+.024,6);
    }
  }
  function busSupport(x,ys,z,footWidth) {
    const mid=(ys[0]+ys[ys.length-1])/2, span=ys[ys.length-1]-ys[0];
    box(bus,'Bus stand anchor plate',footWidth,span+.24,.037,finish.frame,x,mid,.0185);
    for(const y of [ys[0]-.055,ys[ys.length-1]+.055]){
      box(bus,'Terminal support upright',.081,.081,z-.27,finish.frame,x,y,(z-.27)/2);
      pin(bus,'Anchor stud',Math.min(.023,footWidth*.17),.018,finish.steel,x+footWidth*.30,y,.043,6);
    }
    box(bus,'Bus stand crossmember',.13,span+.23,.082,finish.steel,x,mid,z-.27);
  }
  function insulators(x,ys,seat,z) {
    for(const y of ys){
      pin(bus,'Insulation stud',.033,z-seat,finish.terminal,x,y,(seat+z)/2);
      for(let i=1;i<=4;i++)pin(bus,'Insulator shed',.047,.021,finish.ceramic,x,y,seat+(z-seat)*i/5);
    }
  }
  const [pf,tf]=cabinets;
  busSupport(busStart,[...tf.outputs,...pf.outputs],pf.busZ,.17);
  insulators(busStart,pf.outputs,pf.busZ-.23,pf.busZ);
  insulators(busStart,tf.outputs,pf.busZ-.23,tf.busZ);
  busSupport(1.465,tf.outputs,tf.busZ,.085);
  insulators(1.465,tf.outputs,tf.busZ-.23,tf.busZ);
  batchFinishes(bus);

  facts.power={label:system,system,status,source:sparcSource,
    note:'公开资料确认 SPARC 磁体供电用途。柜体、母线与桥架均为自主参数化展示。',
    rows:[['布局基点 XYZ（m）',xyz(0,0,0)],['布置方位','φ = 310°，主机东南外侧'],
      ['连接对象','配电柜 → TF 与 PF/CS 电源柜 → 外围示意端子'],
      ['配套关系','射频源机柜在 ICRF 图层，NBI 高压供电未建模'],
      ['模型来源','CFS 公开设备类别 · 典型工业构造 · 自主示意布置']]
  };
  return {parts,facts,stationCenter:point(1.84,cabinetY,1.10).applyAxisAngle(up,phi).add(anchor)};
}
