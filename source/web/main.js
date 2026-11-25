import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './style.css';
import { defaultCase, validateGeometry, buildDevice, deviceLayers, disposeDevice, selectionOutline } from './geometry.js';
import { cases, showScience as renderScience, loadPlotly } from './science.js';
import { newTarget, invalidate, mountTargetEditor, isEditable, mountDesignWorkspace,
  researchCases, scanCase, mountCaseGuide, componentFacts } from '#workspace-data';
import { makePrdSection } from './plasma-view.js';

const $ = id => document.getElementById(id);
const workspace=document.querySelector('main');
const publicPreview=import.meta.env.MODE==='public-preview';
const [vacuumModule,coolingModule,heatingModule,powerModule]=
  await Promise.all([import('./vacuum-view.js'),import('./cooling-view.js'),import('./heating-view.js'),import('./power-view.js')]);
const prdCase=cases.find(c=>c.equilibrium);
const linkedCase=cases.find(c=>c.localEquilibrium);
if(researchCases.length){
  $('case').replaceChildren(...researchCases.map(c=>new Option(`${c.id} · ${c.label}`,c.caseId)));
  $('configuration').disabled=true;
  $('configuration').hidden=true;
  document.querySelector('label[for="configuration"]').hidden=true;
  document.querySelector('label[for="case"]').textContent='科研案例';
}else{
  for (const c of cases.filter(c => c.equilibrium)) $('case').add(new Option(c.label, c.caseId));
}
let activeCase = newTarget(), device, cutaway = true, deviceMode = 'outside', designWorkspace;
const defaultLayers = new Set(['plasma','vessel','tf','pf','cs','structure','heating','vacuum','cooling','power']);
const visibility = Object.fromEntries(Object.keys(deviceLayers).map(id=>[id,defaultLayers.has(id)]));
const machineLayers = new Set(['vessel','wall','plasma','tf','pf','cs','structure','heating']);
const machineVisibility = Object.fromEntries(Object.keys(deviceLayers).map(id=>[id,machineLayers.has(id)]));
const usesMachine = (page=workspace.dataset.page)=>page==='device';
const usesAssembly = ()=>usesMachine()&&Boolean(activeCase.equilibrium || activeCase.localEquilibrium);
const layerVisibility = ()=>usesMachine()?machineVisibility:visibility;
const componentSelect = $('device-component'), componentDrawer = $('device-drawer');
const auxiliaryLabels={heating:'ICRF 系统',nbi:'NBI 系统',vacuum:'抽气系统',cooling:'水冷系统',power:'电源系统'};
const auxiliaryOptions=Object.fromEntries(Object.entries(auxiliaryLabels).map(([id,name])=>{
  const options=document.createElement('optgroup');
  options.label=name+'部件';
  return [id,options];
}));
let auxiliaryView='heating';
let selectedComponent = '';
let machineReference, localFieldSelect;
const isDiagnosticSection=()=>workspace.dataset.page==='diagnostics'&&Boolean(activeCase.equilibrium)&&cutaway;
const partSystem=id=>Object.keys(auxiliaryLabels).find(system=>device?.machine?.[system]?.parts[id]);
const displayedLayer=id=>id==='vessel'&&isDiagnosticSection()?device?.sectionVessel:
  device?.machine?.[partSystem(id)]?.parts[id]??device?.layers[id];
const layerIsVisible=id=>Boolean(displayedLayer(id)?.visible&&(device?.layers[partSystem(id)]?.visible??true));
const parameterSpecs = [['R0', '大半径 R₀', 1, 8, .05], ['a', '小半径 a', .2, 2, .02], ['kappa', '边界拉长比 κ', 1, 2.5, .05], ['delta', '边界三角形变 δ', -.6, .6, .02]];
for (const [key, label, min, max, step] of parameterSpecs) {
  const row = document.createElement('div');
  row.innerHTML = `<div class="param-head"><label for="${key}">${label}${['R0','a'].includes(key) ? ' / m' : ''}</label><input id="${key}" type="number" min="${min}" max="${max}" step="${step}"></div><input id="${key}-range" aria-label="${label}滑块" type="range" min="${min}" max="${max}" step="${step}">`;
  $('parameter-inputs').append(row);
  for (const id of [key, `${key}-range`]) $(id).addEventListener('input', e => {
    const proposed = { ...activeCase.geometry, [key]: e.target.value === '' ? NaN : Number(e.target.value) };
    const error = validateGeometry(proposed); $('validation').textContent = error;
    if (error) return;
    activeCase.geometry = proposed; invalidate(activeCase); syncInputs(); rebuild(); customCase=structuredClone(activeCase); markTargetEdited();
  });
  $(key).addEventListener('change', syncInputs);
}
const heatingLayers=document.createElement('div');
heatingLayers.className='model-note';
heatingLayers.innerHTML='<strong>辅助加热</strong>';
for (const [id, {label:title, color}] of Object.entries(deviceLayers)) {
  if(id==='heating')$('layers').append(heatingLayers);
  const parent=id==='heating'||id==='nbi'?heatingLayers:$('layers');
  const label = document.createElement('label');
  label.innerHTML = `<input type="checkbox" id="layer-${id}"><span>${title}</span><span class="swatch" style="background:${color}"></span>`;
  parent.append(label);
  const checkbox = $(`layer-${id}`);
  checkbox.checked = visibility[id];
  checkbox.addEventListener('change', e => setLayer(id,e.target.checked));
  componentSelect.add(new Option(title,id));
}
const nbiControls=document.createElement('div');
nbiControls.hidden=true;
nbiControls.innerHTML='<label><input id="nbi-axis" type="checkbox" checked>显示假设方向</label><p role="status">此 NBI 为假设性设备布局示意，不属于 SPARC 公开基准配置，端口兼容性和物理可实现性未经验证。注入通道未验证。</p>';
heatingLayers.append(nbiControls);
$('nbi-axis').addEventListener('change',updateSection);
function setLayer(id, visible) {
  if(id==='vessel'&&workspace.dataset.page==='diagnostics'&&activeCase.equilibrium){
    $('scene-vessel').checked=visible;
    updateSection();
    showComponent(id);
    return;
  }
  layerVisibility()[id] = visible;
  $(`layer-${id}`).checked = visible;
  if (device) device.layers[id].visible = visible;
  if (selectedComponent===id||partSystem(selectedComponent)===id) showComponent(selectedComponent);
  updateSection();
  if(visible&&auxiliaryLabels[id]&&device?.machine?.[id]){
    auxiliaryView=id;
    setView();
  }
}
function showComponent(id) {
  const layer=displayedLayer(id);
  selectedComponent=layer?id:'';
  componentSelect.value=selectedComponent;
  componentDrawer.hidden=!layer;
  disposeDevice(deviceHighlight);deviceHighlight.clear();
  if (!layer){render();return;}
  const facts={...deviceLayers[id],...device.machine?.facts[id]};
  const {label,source,system,status}=facts;
  const {note,rows=[]}=componentFacts(activeCase,facts);
  const bounds=new THREE.Box3().setFromObject(layer,!device.machine);
  $('device-title').textContent=label;
  $('device-note').textContent=note;
  $('device-system').textContent=system??label;
  $('device-validation').textContent=status??'参数化空间示意 · 工程未验证';
  $('device-source').hidden=!source;
  if (source) $('device-source').href=source;
  $('device-parameters').replaceChildren(...rows.map(([term,value])=>{
    const row=document.createElement('div'), name=document.createElement('dt'), item=document.createElement('dd');
    name.textContent=term;item.textContent=value;row.append(name,item);return row;
  }));
  $('device-parameters').hidden=!rows.length;
  $('device-size').textContent=bounds.getSize(new THREE.Vector3()).toArray().map(v=>v.toFixed(3)).join(' × ');
  $('device-z').textContent=`${bounds.min.z.toFixed(3)} 至 ${bounds.max.z.toFixed(3)}`;
  const visible=layerIsVisible(id);
  $('device-visibility').textContent=(visible?'隐藏':'显示')+(auxiliaryLabels[partSystem(id)]??'组件');
  if(visible)deviceHighlight.add(selectionOutline(id==='nbi'?Object.values(device.machine.nbi.parts):[layer]));
  render();
}
function syncInputs() { for (const [key,,, ,step] of parameterSpecs) { $(`${key}-range`).step = isEditable(activeCase) ? step : 'any'; $(key).value = activeCase.geometry[key]; $(`${key}-range`).value = activeCase.geometry[key]; } }
const viewport = $('viewport'), scene = new THREE.Scene();
const diagnosticScene=new THREE.Group();
const deviceHighlight=new THREE.Group();
deviceHighlight.visible=false;
scene.add(diagnosticScene,deviceHighlight);
function selectComponent(id) {
  if (id&&workspace.dataset.page==='diagnostics') viewport.dispatchEvent(new Event('device-component-pick'));
  showComponent(id);
}
componentSelect.addEventListener('change',e=>{
  selectComponent(e.target.value);
  if (selectedComponent && !matchMedia('(max-width:650px)').matches) viewport.scrollIntoView({block:'nearest'});
});
$('device-close').addEventListener('click',()=>showComponent(''));
$('device-visibility').addEventListener('click',()=>setLayer(partSystem(selectedComponent)??selectedComponent,!layerIsVisible(selectedComponent)));
viewport.addEventListener('ts-component-pick',()=>showComponent(''));
const camera = new THREE.PerspectiveCamera(38, 1, .01, 300); camera.up.set(0, 0, 1);
let renderer, controls, restoreVolumeMarkers;
let section, animationFrame, floor;
let lastParticleFrame=0;
let callouts=[];
const calloutProjection=new THREE.Vector3();
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.02;
  renderer.shadowMap.enabled=true;
  const pmrem=new THREE.PMREMGenerator(renderer), room=new RoomEnvironment();
  scene.environment=pmrem.fromScene(room,.06).texture;
  scene.environmentIntensity=.8;
  room.dispose();pmrem.dispose();
  renderer.setClearColor(0x000000, 0); viewport.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '三维聚变装置，鼠标旋转缩放和平移');
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false; controls.minDistance = 1; controls.maxDistance = 60;
  controls.addEventListener('change', render);
  const canvas=renderer.domElement, raycaster=new THREE.Raycaster();
  let pointer;
  canvas.addEventListener('pointerdown',e=>{if(e.button===0&&e.isPrimary) pointer=[e.pointerId,e.clientX,e.clientY];});
  canvas.addEventListener('pointercancel',()=>{pointer=null;});
  viewport.addEventListener('pointerup',e=>{
    const start=pointer; pointer=null;
    if (e.target!==canvas || e.defaultPrevented || !device?.root.visible || !start || start[0]!==e.pointerId || Math.hypot(e.clientX-start[1],e.clientY-start[2])>5) return;
    const rect=canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
    const pickable=[...Object.values(device.layers),device.sectionVessel].filter(g=>g.visible);
    const sectionFaces=usesMachine()&&section?.group.visible?section.group.children.filter(child=>child.isMesh):[];
    pickable.push(...sectionFaces);
    const hit=raycaster.intersectObjects(pickable,true)[0];
    let layer=hit?.object;
    while(layer&&!pickable.includes(layer)&&!partSystem(layer.name)) layer=layer.parent;
    selectComponent(sectionFaces.includes(layer)?'plasma':layer?.name??'');
  });
  scene.add(new THREE.HemisphereLight(0xb4d8ed, 0x253045, 1.4));
  const key = new THREE.DirectionalLight(0xfff4da, 2.7); key.position.set(5,-4,9);scene.add(key);
  key.castShadow=true;
  Object.assign(key.shadow.camera,{left:-22,right:22,top:22,bottom:-22,far:50});
  key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.035;
  const rim = new THREE.DirectionalLight(0x72c8e0, 2.1); rim.position.set(-6,4,4);scene.add(rim);
  floor=new THREE.Group();
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(38,38),new THREE.MeshBasicMaterial({color:0x14222d}));
  const shadows=new THREE.Mesh(new THREE.PlaneGeometry(38,38),new THREE.ShadowMaterial({opacity:.54}));
  shadows.position.z=.001;shadows.receiveShadow=true;floor.add(plane,shadows);
  const grid = new THREE.GridHelper(16,40,0x385265,0x1d313d);grid.rotation.x=Math.PI/2;grid.position.z=.002;floor.add(grid);
  scene.add(floor);
  new ResizeObserver(() => { const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return; camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);render(); }).observe(viewport);
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); $('view-status').textContent = '图形上下文丢失，请刷新页面'; });
} catch { $('unavailable').hidden = false; $('unavailable').textContent = '无法创建 WebGL 视窗，请启用浏览器硬件加速后重试。'; $('view-status').textContent = '三维视窗不可用'; }
function render() {
  deviceHighlight.visible=Boolean(selectedComponent&&!componentDrawer.hidden&&device?.root.visible&&layerIsVisible(selectedComponent));
  if (renderer && workspace.dataset.page!=='physics' &&
      !(workspace.dataset.page==='diagnostics'&&activeCase.research?.diagnosticGap)){
    renderer.render(scene,camera);
    const width=viewport.clientWidth,height=viewport.clientHeight;
    for(const {el,position} of callouts){
      calloutProjection.copy(position).project(camera);
      const x=(calloutProjection.x+1)*.5*width,y=(1-calloutProjection.y)*.5*height;
      el.hidden=!diagnosticScene.visible||x<42||x>width-42||y<68||y>height-16||Math.abs(calloutProjection.z)>1;
      if(!el.hidden)el.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
    }
  }
}
function setCallouts(labels) {
  callouts=labels.map(([text,position])=>{
    const el=document.createElement('span');el.textContent=text;
    return {el,position};
  });
  $('scene-callouts').replaceChildren(...callouts.map(({el})=>el));
}
function updateSection() {
  const inDiagnostics=workspace.dataset.page==='diagnostics';
  const shown=layerVisibility();
  const cutAngle=device?.machine?.cutAngle;
  const machineSection=usesAssembly()&&cutAngle!==undefined&&device.root.visible&&shown.plasma;
  diagnosticScene.visible=inDiagnostics && $('configuration').value==='tokamak' && Boolean(activeCase.equilibrium);
  if(section){
    section.group.visible=diagnosticScene.visible||machineSection;
    section.group.rotation.z=machineSection?cutAngle:0;
    section.flux.visible=machineSection||$('scene-flux').checked;
    section.points.visible=inDiagnostics&&$('scene-motion').checked;
  }
  $('scene-legend').hidden=!section?.group.visible;
  if(localFieldSelect) localFieldSelect.disabled=!machineSection;
  if(device){
    for(const [id,layer] of Object.entries(device.layers)){
      layer.visible=inDiagnostics&&activeCase.equilibrium ? (id==='vessel'&&!cutaway&&$('scene-vessel').checked) : shown[id];
    }
    device.sectionVessel.visible=isDiagnosticSection()&&$('scene-vessel').checked;
    if(device.machine?.nbi)device.machine.nbi.axis.visible=$('nbi-axis').checked;
  }
  nbiControls.hidden=!device?.machine?.nbi||!shown.nbi;
  if(usesMachine()&&renderer)renderer.shadowMap.needsUpdate=true;
  if(!animationFrame && inDiagnostics && section && $('scene-motion').checked) animationFrame=requestAnimationFrame(animateSection);
  render();
}
function animateSection(time) {
  animationFrame=undefined;
  if (workspace.dataset.page!=='diagnostics' || !section?.group.visible || !$('scene-motion').checked) return;
  if(time-lastParticleFrame>=32){section.frame(time);render();lastParticleFrame=time;}
  animationFrame=requestAnimationFrame(animateSection);
}
function attachSection(field,profiles,quantities) {
  if(!renderer || activeCase.caseId!==field.caseId) return;
  const diagnostic=Boolean(activeCase.equilibrium);
  const view=makePrdSection(field,profiles,quantities,{animate:diagnostic});
  const reference={field};
  machineReference=reference;
  section=view;
  scene.add(view.group);
  let fieldControl;
  if(!diagnostic){
    fieldControl=document.createElement('label');
    fieldControl.textContent='内部截面色标';
    localFieldSelect=document.createElement('select');
    localFieldSelect.id='device-field';
    localFieldSelect.append(...quantities.map((q,i)=>new Option(`${q.label} · ${q.unit}`,i)));
    localFieldSelect.value='1';
    localFieldSelect.onchange=updateSceneQuantity;
    fieldControl.append(localFieldSelect);
    $('layers').before(fieldControl);
  }
  if(usesMachine()){rebuild();sceneTitle();}
  updateSceneQuantity();updateSection();
  if(diagnostic) import('#diagnostic-workspace').then(({loadPorts})=>loadPorts(field)).then(ports=>{
    if(machineReference!==reference)return;
    reference.ports=ports;
    if(usesMachine())rebuild();
  }).catch(error=>console.error('无法读取 TS 端口位置',error));
  return ()=>{
    fieldControl?.remove();
    if(fieldControl) localFieldSelect=undefined;
    view.group.removeFromParent();disposeDevice(view.group);view.dispose();
    if(section===view)section=undefined;
    if(machineReference===reference)machineReference=undefined;
    updateSection();
  };
}
function updateSceneQuantity() {
  if(!section) return;
  const {label,unit,min,max,colors}=section.quantity(Number((localFieldSelect??$('scene-quantity')).value));
  const format=localFieldSelect?v=>Number(v.toPrecision(4)).toString():v=>v.toFixed(1);
  $('scene-legend').innerHTML=`<span>${label} · ${unit}</span><i></i><span>${format(min)}–${format(max)}</span>`;
  $('scene-legend').querySelector('i').style.background=`linear-gradient(90deg,${colors.map(c=>`rgb(${c.join(',')})`).join(',')})`;
  render();
}
for(const id of ['scene-vessel','scene-flux','scene-motion']) $(id).addEventListener('change',updateSection);
if(matchMedia('(prefers-reduced-motion: reduce)').matches) $('scene-motion').checked=false;
$('scene-quantity').addEventListener('change',updateSceneQuantity);
function showScience(caseId, candidate) {
  return renderScience(caseId, candidate, {scene:diagnosticScene,render,camera,canvas:renderer?.domElement,
    focusVolume:controls?focusVolume:undefined,attachSection,controlsHost:$('diagnostic-controls'),
    inspector:$('ts-inspector'),plotHost:$('diagnostic-plot'),setCallouts,
    selectCase,linkedCaseId:linkedCase?.caseId,linkedCandidateId:linkedCase?.localEquilibrium.candidateId});
}
function rebuild() {
  if (!renderer) return;
  if (device) { scene.remove(device.root); disposeDevice(device.root); }
  const detailed=usesAssembly();
  // Camera motion can reuse the main assembly's shadows until geometry or layers change.
  renderer.shadowMap.autoUpdate=!detailed;
  const prdEngineering=activeCase.equilibrium?{buildVacuum:vacuumModule?.buildVacuumSystem,
    buildCooling:coolingModule?.buildCoolingSystem,buildIcrf:heatingModule?.buildIcrfSystem,buildNbi:heatingModule?.buildNbiSystem,
    buildPower:powerModule?.buildPowerSystem,sparc:true}:undefined;
  const specificField=machineReference?.field.caseId===activeCase.caseId?machineReference:undefined;
  const engineering=detailed?{internal:deviceMode==='inside',...prdEngineering,...specificField}:undefined;
  device = buildDevice(activeCase.geometry,cutaway,Boolean(activeCase.equilibrium)&&!detailed,engineering);
  for(const id of ['heating','nbi','power']){
    const label=$('layer-'+id).closest('label'), option=componentSelect.querySelector(`option[value="${id}"]`);
    const name=device.machine?.facts[id]?.label??deviceLayers[id].label;
    label.children[1].textContent=name;option.textContent=name;
    if(id==='nbi')label.hidden=option.hidden=!device.machine?.nbi;
  }
  for(const [id,options] of Object.entries(auxiliaryOptions)){
    const system=device.machine?.[id];
    if(!system){options.remove();continue;}
    options.replaceChildren(...Object.keys(system.parts).map(key=>new Option(system.facts[key].label,key)));
    if(!options.parentNode)componentSelect.append(options);
  }
  device.root.visible=$('configuration').value==='tokamak';
  scene.add(device.root);
  device.root.traverse(object=>{if(object.isMesh){object.castShadow=!object.material.transparent;object.receiveShadow=true;}});
  if(floor) {
    floor.position.z=-1.60*activeCase.geometry.kappa*activeCase.geometry.a;
    floor.children[0].material.color.setHex(detailed?0x111a22:0x14222d);
  }
  for(const [id,visible] of Object.entries(layerVisibility())) $('layer-'+id).checked=visible;
  updateSection();
  showComponent(selectedComponent);
  render();
}
function setView(view = 'iso') {
  if (!controls) return;
  restoreVolumeMarkers?.();
  restoreVolumeMarkers=undefined;
  controls.minDistance=1;
  const p = activeCase.geometry, extent = Math.max(p.R0 + 1.4 * p.a, p.kappa * p.a * 1.5);
  const diagnostic=workspace.dataset.page==='diagnostics'&&activeCase.equilibrium;
  const aspect=viewport.clientWidth/viewport.clientHeight||camera.aspect;
  const preferred=machineVisibility[auxiliaryView]?auxiliaryView:Object.keys(auxiliaryLabels).find(id=>machineVisibility[id]);
  const accessory=view==='iso'&&usesMachine()?device?.machine?.[preferred]:undefined;
  const station=accessory?.focus??accessory?.stationCenter??accessory?.pumpCenter;
  const distance=diagnostic?Math.max(4.65,6.8/aspect):
    (extent+(station?.length()??0)*.125)*(usesMachine()?Math.max(3.38,3.60/aspect):aspect<1?4.25:3.15);
  controls.target.set(diagnostic?2.63:0,0,diagnostic?-.13:usesMachine()?-.38*p.kappa*p.a:0);
  if(station)controls.target.addScaledVector(new THREE.Vector3(station.x,station.y,0),preferred==='nbi'?.31:.22);
  if(accessory?.stationCenter&&deviceMode==='inside')controls.target.z-=.12*p.kappa*p.a;
  const heatingAngle=preferred==='heating'?[-.65,-1,.49]:[.79,-1,.55];
  const angle=accessory&&preferred==='power'?[-.38,-1,.59]:accessory?.focus?heatingAngle:
    accessory?.stationCenter?(deviceMode==='inside'?[.13,-1,.60]:[.88,-.66,.53]):
    station?(deviceMode==='inside'?[-.90,-.60,.45]:[.88,.70,.47]):diagnostic?[.22,-1,.24]:usesMachine()?
    (deviceMode==='inside'?[-.12,-1,.48]:[.83,-1,.57]):[1,-1.6,1.1];
  camera.position.copy(new THREE.Vector3(...(view === 'front' ? [0, -1, 0] : view === 'top' ? [.0001, 0, 1] : angle)).normalize().multiplyScalar(distance).add(controls.target));
  controls.update(); render();
}
function focusVolume(point,size,restoreMarkers) {
  if (!point) {
    if (restoreVolumeMarkers) setView();
    return;
  }
  restoreVolumeMarkers=restoreMarkers;
  controls.minDistance=.02;
  const offset = camera.position.clone().sub(controls.target).normalize();
  controls.target.set(point.x,point.y,point.Z);
  camera.position.copy(controls.target).addScaledVector(offset,Math.max(.045,4*size));
  controls.update();
  render();
}
function availability() {
  const available = $('configuration').value === 'tokamak';
  workspace.dataset.case=activeCase.caseId;
  workspace.dataset.researchCase=activeCase.research?.id??'';
  updateCaseGuide(activeCase);
  $('parameters').disabled = !available || !isEditable(activeCase); $('layers').disabled = !available;
  if (device) device.root.visible = available;
  if (!available) showComponent('');
  $('unavailable').hidden = available && !!renderer;
  if (!available) $('unavailable').textContent = $('configuration').value !== 'tokamak' ? '该装置构型尚未实现。请选择常规托卡马克继续。' : '该参考案例尚未接入。未加载 SPARC 工程几何或物理数据。';
  $('view-title').textContent = available ? (activeCase.candidate_id?activeCase.label:cases.find(c=>c.caseId===activeCase.caseId)?.label ?? '轴对称托卡马克') : '等待可用构型与案例';
  if (renderer) $('view-status').textContent = available ? (activeCase.candidate_id?`● 候选几何 · ${activeCase.resultKind}`:'● 几何预览 · 未执行在线物理计算') : '尚未实现 / 未加载';
  $('case-note').textContent = activeCase.candidate_id ? `${activeCase.candidate_id}；真实离线计算，结构仍为示意。修改前请复制当前案例。` : activeCase.caseId === 'custom' ? '自定义几何；不沿用任何参考案例的计算结果。' : (activeCase.presetFields?'参考值及缺项见来源表；形状可能使用已标注的平台示例。修改请复制。':'有来源的分离面参数；线圈/真空室仍为示意。参考几何锁定，修改请切回自定义。');
  if (activeCase.research) {
    const meta=activeCase.research;
    $('case-note').textContent=`${meta.id} · ${meta.model??meta.version}${activeCase.candidate_id?' · '+activeCase.candidate_id:''}`;
  }else if (activeCase.equilibrium) {
    $('case-note').textContent = 'CFS SPARCPublic · FreeGS 双零 · TRANSP / CGYRO';
  }
  sceneTitle();
  updateSection();
  render();
}
function sceneTitle() {
  const detailed=usesAssembly();
  $('device-modes').hidden=!detailed;
  $('cutaway').hidden=detailed;
  if(usesMachine()&&$('configuration').value==='tokamak'){
    $('device-model-note').textContent=activeCase.equilibrium
      ? '等离子体采用 SPARCPublic FreeGS 边界。主机结构按 PRD 参考尺寸自主重建，属于工程外观示意。'
      : `${activeCase.geometrySource??'当前尺寸的解析 D 形包络。'} 组件为参数化空间示意。`;
    $('view-status').textContent=activeCase.localEquilibrium
      ? (machineReference?'条件性 GS 磁面 · 参数化研究几何':'参数化研究几何 · GS 场尚未加载')
      : detailed?(deviceMode==='inside'?'内部展示 · 固定扇区开口':'完整外观 · 主机与支承结构')
      : '参数化研究几何 · 磁平衡未提供';
  }
  if (!activeCase.equilibrium||$('configuration').value!=='tokamak') return;
  const inDiagnostics=workspace.dataset.page==='diagnostics';
  $('view-title').textContent=inDiagnostics?'汤姆逊散射（TS） · 诊断设计':'SPARC PRD · 装置模型';
  if(!detailed) $('view-status').textContent=inDiagnostics?'FreeGS 双零固定截面 · 自主器件模型':'PRD 参考尺寸 · 参数化装置示意';
}
let customCase = structuredClone(activeCase);
function markTargetEdited(){if(isEditable(activeCase)){invalidate(activeCase);showScience('custom');$('science-status').textContent='目标已编辑 · 计算结果尚未更新（尚未求解）';designWorkspace?.clearSelection();}}
function applyCustom(c,refresh=true){activeCase=c;customCase=structuredClone(c);$('case').value='custom';$('configuration').value=c.configuration;if(refresh){syncInputs();rebuild();availability();setView();showScience('custom');}markTargetEdited();}
function applyCandidate(c){if(isEditable(activeCase))customCase=structuredClone(activeCase);activeCase=scanCase(c);$('case').value='design';$('configuration').value='tokamak';refreshCase(activeCase);}
$('configuration').addEventListener('change', () => { if(isEditable(activeCase)){activeCase.configuration=$('configuration').value;customCase=structuredClone(invalidate(activeCase));} availability(); showScience($('configuration').value === 'tokamak' ? activeCase.caseId : 'custom',$('configuration').value === 'tokamak'&&activeCase.candidate_id?activeCase:null); markTargetEdited(); });
function refreshCase(candidate) {
  cameras.clear();
  selectedComponent='';
  if(!activeCase.equilibrium) $('scene-quantity').value='0';
  showScience(activeCase.caseId,candidate);
  $('validation').textContent = '';
  syncInputs(); rebuild(); availability(); setView(); targetEditor.sync();
}
function selectCase(caseId) {
  if (isEditable(activeCase)) customCase = structuredClone(activeCase);
  $('case').value=caseId;
  if(caseId==='design'){designWorkspace.selectReference();return;}
  designWorkspace.clearSelection();
  const selected = cases.find(c => c.caseId === caseId);
  activeCase = selected ? structuredClone(selected) : structuredClone(customCase);
  $('configuration').value=activeCase.configuration;
  refreshCase();
  markTargetEdited();
}
$('case').addEventListener('change', () => selectCase($('case').value));
$('reset').addEventListener('click', () => { activeCase.geometry=structuredClone(defaultCase.geometry);invalidate(activeCase);customCase=structuredClone(activeCase);$('validation').textContent = ''; syncInputs(); rebuild();setView();markTargetEdited(); });
$('cutaway').addEventListener('click', e => { cutaway = !cutaway; e.currentTarget.setAttribute('aria-pressed', cutaway); rebuild(); availability(); });
const deviceModeButtons=document.querySelectorAll('[data-device-mode]');
for(const button of deviceModeButtons)button.addEventListener('click',()=>{
  if(button.dataset.deviceMode===deviceMode)return;
  deviceMode=button.dataset.deviceMode;
  for(const mode of deviceModeButtons) mode.setAttribute('aria-pressed',mode===button);
  rebuild();sceneTitle();setView();
});
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
const targetEditor=mountTargetEditor({getCase:()=>activeCase,applyCase:applyCustom,markEdited:markTargetEdited});
const updateCaseGuide=mountCaseGuide({workspace,selectCase});
designWorkspace=mountDesignWorkspace({onSelect:applyCandidate,loadPlotly});
const cameras=new Map();
function changePage() {
  const requested=location.hash.slice(1);
  const page=['physics','device','diagnostics'].includes(requested)?requested:(publicPreview?'physics':'diagnostics');
  const previous=workspace.dataset.page;
  if(previous!==page && controls){
    cameras.set(previous,[camera.position.clone(),controls.target.clone()]);
    workspace.dataset.page=page;
    if(usesMachine(previous)!==usesMachine(page))rebuild();
    if(page!=='physics'){
      const pose=cameras.get(page);
      if(pose){camera.position.copy(pose[0]);controls.target.copy(pose[1]);controls.update();}else setView();
    }
  }
  workspace.dataset.page=page;
  for(const link of document.querySelectorAll('[data-page-link]')){
    if(link.dataset.pageLink===page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  sceneTitle();
  if(previous!==page){
    if(page==='device'&&selectedComponent)showComponent(selectedComponent);
    else componentDrawer.hidden=true;
  }
  updateSection();
  if(previous!==page)document.dispatchEvent(new Event('workspace-page-change'));
}
if(publicPreview){
  document.body.dataset.build='public-preview';
  $('workspace-mode').textContent='公开预览';$('ts-state').textContent='预计算';$('diagnostic-empty').textContent='正在加载已审核的 TS 结果…';
  document.title='Fusion Design Platform · Interactive Digital Twin Preview';
  document.querySelector('.brand small').textContent='Interactive Digital Twin Preview';
  const references=document.createElement('a');
  references.href='./references.html';
  references.textContent='References';
  document.querySelector('header nav').append(references);
}
if(matchMedia('(max-width:650px)').matches){$('diagnostic-tree').open=false;document.querySelector('.plasma-controls').open=false;}
window.addEventListener('hashchange',changePage);
if(prdCase) selectCase(prdCase.caseId);else{syncInputs();rebuild();setView();availability();markTargetEdited();}
changePage();

