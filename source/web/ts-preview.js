import * as THREE from 'three';
import {disposeDevice, selectionOutline} from './geometry.js';
import {collectionHardware} from './ts-hardware.js';

const colors = ['#70c9ff','#ffd17a','#ff786e'];
let pending;
function loadPreview(field) {
  pending ??= fetch(`${import.meta.env.BASE_URL}sparc-prd-ts-preview.json`).then(response => {
    if (!response.ok) throw Error(`TS 数据请求失败（HTTP ${response.status}）`);
    return response.json();
  });
  return pending.then(data => {
    if (data.schemaVersion !== 1 || data.caseId !== field.caseId ||
        data.equilibriumSha256 !== field.source.sha256 || data.status !== 'synthetic_fixed_configuration' ||
        data.groups.length !== 3 || data.groups.some(g => g.points.length !== 30)) {
      throw Error('TS 展示数据与当前 PRD 平衡不匹配');
    }
    return data;
  });
}

export async function loadPorts(field) {
  return (await loadPreview(field)).groups.map(g => g.window);
}

const vector = xyz => new THREE.Vector3(...xyz);
const project = ([x,y,z]) => [Math.hypot(x,y),z];
const fmt = value => Number(value.toPrecision(5)).toLocaleString('en-US',{maximumSignificantDigits:5});
const density = value => fmt(value/1e19);
const projection = positions => ({x:positions.map(p=>project(p)[0]),y:positions.map(p=>p[2])});
const asFrame = frame => ({
  ...frame,center:vector(frame.center),u:vector(frame.u),v:vector(frame.v),normal:vector(frame.normal),
});

export async function mountDiagnostics({host,field,query,scene,render,camera,canvas,map,isActive,Plotly,
  inspector,plotHost,setCallouts,updateOverlay}) {
  const data = await loadPreview(field);
  if (!isActive()) return;
  const points = data.groups.flatMap(g => g.points);
  const rows = new Map(points.map(point => [point.id,point]));
  for (const {xyz,center,id} of points) {
    const sample = query(...project(xyz));
    if (!sample.valid || Math.abs(sample.Te_keV / center.te - 1) > 1e-10 ||
        Math.abs(sample.ne_m3 / center.ne - 1) > 1e-10) {
      throw Error(`TS 参考温密与共享物理场不符（${id}）`);
    }
  }
  host.innerHTML = `
    <label for="preview-ts-point">散射点</label><select id="preview-ts-point"></select>
    <p>固定激光 · R=1.78 m · −Z<br>1064 nm · 1 J / 脉冲</p>
    <details><summary>场景图层</summary><div class="ts-layer-list" id="preview-ts-layers"></div></details>
    <p>可从三维场景或 R–Z 图选择散射点。参数编辑与计算在本地科研版提供。</p>`;
  const selector = host.querySelector('#preview-ts-point');
  for (const g of data.groups) {
    const options = document.createElement('optgroup');
    options.label = g.id;
    for (const point of g.points) options.append(new Option(`${point.id} · Z ${point.xyz[2].toFixed(3)} m`,point.id));
    selector.append(options);
  }
  const placeholder = inspector.querySelector('#inspector-empty');
  const readout = document.createElement('section');
  readout.className = 'preview-ts-readout';
  placeholder.hidden = true;
  inspector.append(readout);
  const charts = plotHost.parentElement;
  charts.hidden = false;
  plotHost.innerHTML = `<label for="preview-ts-chart">图表</label><select id="preview-ts-chart">
    <option value="spectrum">Naito 合成光谱</option><option value="detector">六通道探测器</option>
    </select><div id="preview-ts-plot" class="ts-response-plot"></div>`;
  const chart = plotHost.querySelector('#preview-ts-plot'), chartSelect = plotHost.querySelector('select');

  const view = new THREE.Group();
  view.name = 'PRD precomputed Thomson scattering hardware and samples';
  scene.add(view);
  const groups = data.groups.map(g => ({
    window:asFrame(g.window),lens:asFrame(g.lens),centerView:{shellDepth:g.shellDepth},
  }));
  const receiver = vector(data.receiver);
  const hardware = collectionHardware(groups,receiver,-1.6*field.displayGeometry.kappa*field.displayGeometry.a,colors);
  const laserStart = vector(data.laser.start), laserEnd = vector(data.laser.end);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.007,.007,laserStart.distanceTo(laserEnd),12),
    new THREE.MeshBasicMaterial({color:0x81ffd2,toneMapped:false,depthTest:false}));
  beam.rotation.x = Math.PI/2;
  beam.position.copy(laserStart).lerp(laserEnd,.5);
  beam.renderOrder = 12;
  const layerItems = {laser:[beam],windows:[],lenses:[hardware.rack],fibres:[],spectrometer:[hardware.spectrometer],points:[]};
  const markerGeometry = new THREE.SphereGeometry(.016,8,6);
  const markers = new Map(), deviceNotes = new Map();
  for (const [index,g] of data.groups.entries()) {
    const {window,lens,fibre} = hardware.channels[index];
    layerItems.windows.push(window);
    layerItems.lenses.push(lens);
    layerItems.fibres.push(fibre);
    deviceNotes.set(window,[`${g.id} 观察窗口`,g.window.center,g.window.diameter]);
    deviceNotes.set(lens,[`${g.id} 集光透镜`,g.lens.center,g.lens.diameter]);
    const material = new THREE.MeshBasicMaterial({color:colors[index],depthTest:false,depthWrite:false});
    for (const point of g.points) {
      const marker = new THREE.Mesh(markerGeometry,material);
      marker.position.fromArray(point.xyz);
      marker.renderOrder = 20;
      marker.userData.pointId = point.id;
      markers.set(point.id,marker);
      layerItems.points.push(marker);
    }
  }
  view.add(...Object.values(layerItems).flat());
  const outline = new THREE.Group();
  view.add(outline);
  const labels = {laser:'激光',windows:'观察窗口',lenses:'集光透镜',fibres:'光纤',spectrometer:'谱仪',points:'散射点'};
  const layers = host.querySelector('#preview-ts-layers');
  layers.innerHTML = Object.entries(labels).map(([id,label]) =>
    `<label><input type="checkbox" data-layer="${id}" checked>${label}</label>`).join('');
  function updateCallouts() {
    const callouts = [];
    if (beam.visible) callouts.push(['激光 · R=1.78 m',laserStart]);
    for (const [index,{lens}] of hardware.channels.entries()) {
      if (lens.visible) callouts.push([`${data.groups[index].id} 集光`,groups[index].lens.center.clone().add(new THREE.Vector3(.22,0,.15))]);
    }
    if (hardware.spectrometer.visible) callouts.push(['谱仪',receiver.clone().add(new THREE.Vector3(0,0,.26))]);
    setCallouts?.(callouts);
  }
  let selected;
  function refreshOverlay() {
    const traces = [];
    if (beam.visible) traces.push({...projection([data.laser.start,data.laser.end]),type:'scatter',mode:'lines',
      line:{color:'#81ffd2',width:1},hoverinfo:'skip'});
    if (layerItems.points[0].visible) {
      for (const [index,g] of data.groups.entries()) {
        traces.push({...projection(g.points.map(p=>p.xyz)),customdata:g.points.map(p=>p.id),
          type:'scatter',mode:'markers',name:g.id,marker:{size:4,color:colors[index]},hoverinfo:'none'});
      }
      if (selected) traces.push({...projection([selected.xyz]),customdata:[selected.id],type:'scatter',mode:'markers',
        marker:{size:15,symbol:'circle-open',color:'#ffffff',line:{width:2}},hoverinfo:'skip'});
    }
    updateOverlay(traces).catch(report);
  }
  function report(error) {
    if (isActive()) host.querySelector('p:last-child').textContent = `诊断图表不可用：${error.message}`;
  }

  function drawChart() {
    if (!selected || chart.clientWidth === 0) return;
    const channels = data.bands.map((_,i)=>`CH ${i+1}`);
    const spectrum = chartSelect.value === 'spectrum';
    const peak = Math.max(...selected.density);
    const relevant = selected.wavelength.filter((_,i)=>selected.density[i]>peak*.001);
    const shapes = data.bands.map(({low,high},i)=>({type:'rect',xref:'x',yref:'paper',x0:low,x1:high,y0:0,y1:1,
      layer:'below',line:{width:0},fillcolor:i%2?'#68b7f52b':'#65dcc024'}));
    const instrumentTrace = (y,name,color) => ({type:'bar',x:channels,y,name,marker:{color}});
    const traces = spectrum ? [{type:'scatter',mode:'lines',x:selected.wavelength,y:selected.density,
      line:{color:'#8ae4cf'},name:'合成光子谱'}] :
      [instrumentTrace(selected.measured,'模拟读出','#79ebcf'),instrumentTrace(selected.fit.predicted,'反演拟合','#83bff9')];
    Plotly.react(chart,traces,{
      width:chart.clientWidth,height:chart.clientHeight,paper_bgcolor:'transparent',plot_bgcolor:'#111f2d',
      font:{color:'#b7cbd9',size:11},margin:{l:62,r:12,t:12,b:55},shapes:spectrum?shapes:[],
      xaxis:spectrum ? {title:{text:'波长 (nm)'},range:[Math.min(data.bands[0].low,relevant[0]),
        Math.max(data.bands.at(-1).high,relevant.at(-1))],gridcolor:'#304353'} : {},
      yaxis:{title:{text:spectrum?'光子 / 脉冲 / nm':'电子数 / 脉冲'},gridcolor:'#304353',rangemode:'tozero'},
      legend:{orientation:'h',y:1.14},showlegend:!spectrum,
    },{displaylogo:false,responsive:true}).catch(report);
  }
  let selectedDevice;
  function setDevice(object) {
    disposeDevice(outline);
    outline.clear();
    selectedDevice = object;
    if (!object) return;
    if (object.visible) outline.add(selectionOutline([object]));
    const [name,position,diameter] = deviceNotes.get(object);
    readout.innerHTML = `<h3>${name}</h3><p>自主光学布局示意</p><p>中心 (x, y, Z) = ${position.map(fmt).join(', ')} m</p>
      <p>通光口径 ${fmt(diameter*1000)} mm</p><button type="button" class="secondary">返回 ${selected.id}</button>`;
    readout.querySelector('button').addEventListener('click',()=>select(selected.id));
    render();
  }
  function select(id) {
    const point = rows.get(id);
    if (!point) return;
    setDevice(null);
    if (selected) {
      const previous = markers.get(selected.id);
      previous.scale.setScalar(1);
      previous.renderOrder = 20;
    }
    selected = point;
    const marker = markers.get(id);
    marker.scale.setScalar(2);
    marker.renderOrder = 21;
    selector.value = id;
    const {center,reference,fit,statistics} = point;
    const stat = (row,format) =>
      `σ ${format(row.sigma)} · 95% 分位区间 [${row.interval.map(format).join(', ')}]`;
    readout.innerHTML = `<h3>${id} · Z=${point.xyz[2].toFixed(3)} m</h3><p>合成诊断 · 自主光学研究设计</p>
      <p>散射角 ${fmt(point.angle)}° · 有效立体角 ${fmt(point.omega)} sr · 散射体积 ${fmt(point.volumeM3)} m³</p>
      <div class="preview-ts-table"><table><thead><tr><th>温密依据</th><th>Te (keV)</th><th>ne (10¹⁹ m⁻³)</th></tr></thead><tbody>
      ${[['TRANSP 点值',center],['体积加权',reference],['单次带噪反演',fit]].map(([name,row])=>
        `<tr><td>${name}</td><td>${fmt(row.te)}</td><td>${density(row.ne)}</td></tr>`).join('')}</tbody></table></div>
      <h4>统计误差 · ${statistics.valid}/${statistics.trials} 次有效</h4>
      <p>Te (keV) · ${stat(statistics.te,fmt)}<br>ne (10¹⁹ m⁻³) · ${stat(statistics.ne,density)}</p>
      <details><summary>六通道光子数与探测器</summary><p>总光子数 ${fmt(point.totalPhotons)} / 脉冲。矩形通带，假设光路透过率 1，QE ${data.detector.qe}，读出噪声 ${data.detector.readNoise} e⁻ RMS。</p>
      <div class="preview-ts-table"><table><thead><tr><th>通道 (nm)</th><th>光子 / 脉冲</th><th>读出 e⁻</th></tr></thead><tbody>
      ${data.bands.map(({low,high},i)=>`<tr><td>${low}–${high}</td><td>${fmt(point.photons[i])}</td><td>${fmt(point.measured[i])}</td></tr>`).join('')}
      </tbody></table></div><p><a href="${data.spectrumSources.naitoSource}" target="_blank" rel="noopener">Naito 光谱</a> ·
      <a href="${data.spectrumSources.iterFilterSource}" target="_blank" rel="noopener">ITER 六通道来源</a></p></details>`;
    drawChart();
    refreshOverlay();
    render();
  }
  selector.addEventListener('change',()=>select(selector.value));
  chartSelect.addEventListener('change',drawChart);
  layers.addEventListener('change',event=>{
    const {layer} = event.target.dataset;
    if (!layer) return;
    for (const item of layerItems[layer]) item.visible = event.target.checked;
    if (selectedDevice && !selectedDevice.visible) select(selected.id);
    updateCallouts();
    refreshOverlay();
    render();
  });
  function onPlotClick({event,points:clicked}) {
    if (!layerItems.points[0].visible) return;
    if (!event) {
      select(clicked[0]?.customdata);
      return;
    }
    // Adjacent samples can share a marker's hitbox at the full-height R–Z scale.
    const rect = map.getBoundingClientRect(), {xaxis,yaxis} = map._fullLayout;
    const x = event.clientX - rect.left - xaxis._offset;
    const y = event.clientY - rect.top - yaxis._offset;
    let closest, distance = 7;
    for (const point of points) {
      const [r,z] = project(point.xyz), px = xaxis.l2p(r), py = yaxis.l2p(z);
      if (px < 0 || px > xaxis._length || py < 0 || py > yaxis._length) continue;
      const offset = Math.hypot(x-px,y-py);
      if (offset < distance) {closest = point;distance = offset;}
    }
    if (closest) select(closest.id);
  }
  map.on('plotly_click',onPlotClick);
  const observer = new ResizeObserver(drawChart);
  observer.observe(chart);
  const raycaster = new THREE.Raycaster();
  let pointer;
  function down(event) {
    if (event.button === 0) pointer = [event.clientX,event.clientY];
  }
  function up(event) {
    const start = pointer;
    pointer = null;
    if (!start || !scene.visible || Math.hypot(event.clientX-start[0],event.clientY-start[1]) > 5) return;
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,
      1-(event.clientY-rect.top)/rect.height*2),camera);
    const point = raycaster.intersectObjects(layerItems.points.filter(item=>item.visible),false)[0];
    if (point) {
      event.preventDefault();
      select(point.object.userData.pointId);
      return;
    }
    const hit = raycaster.intersectObjects([...deviceNotes.keys()].filter(item=>item.visible),true)[0];
    if (hit) {
      event.preventDefault();
      let object = hit.object;
      while (!deviceNotes.has(object)) object = object.parent;
      setDevice(object);
    }
  }
  canvas?.addEventListener('pointerdown',down);
  canvas?.addEventListener('pointerup',up);
  updateCallouts();
  select('W2:15');
  return () => {
    canvas?.removeEventListener('pointerdown',down);
    canvas?.removeEventListener('pointerup',up);
    map.removeListener?.('plotly_click',onPlotClick);
    observer.disconnect();
    Plotly.purge(chart);
    chart.remove();
    plotHost.replaceChildren();
    charts.hidden = true;
    view.removeFromParent();
    disposeDevice(view);
    readout.remove();
    placeholder.hidden = false;
    setCallouts?.([]);
  };
}
