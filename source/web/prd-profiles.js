const NE_DISPLAY = 1e19;

function interval(grid, value) {
  let lo = 0, hi = grid.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (grid[mid] <= value) lo = mid;
    else hi = mid;
  }
  return lo;
}

const lerp = (a, b, f) => a + f * (b - a);

export function interpolateProfile(profile, psiN) {
  const s = profile.psiN;
  if (!Number.isFinite(psiN) || psiN < s[0] || psiN > s.at(-1)) return null;
  const i = interval(s, psiN);
  const f = (psiN - s[i]) / (s[i + 1] - s[i]);
  return {
    Te_keV:lerp(profile.Te_keV[i], profile.Te_keV[i + 1], f),
    ne_m3:lerp(profile.ne_m3[i], profile.ne_m3[i + 1], f),
  };
}

export function queryPrdPosition(field, profiles, R, Z) {
  const {R: r, Z: z, psi_N: grid, geqdsk} = field;
  const profile = profiles.profiles.find(p => p.source.model === profiles.mapping.profile);
  const result = {
    R, Z, psiN:null, rhoPol:null, Te_keV:null, ne_m3:null, valid:false,
    equilibriumSha256:field.source.sha256, profileSource:profile?.source ?? null, mappingStatus:profiles.mapping.status,
  };
  if (!profile || profiles.caseId !== field.caseId || profiles.equilibriumSha256 !== field.source.sha256) {
    return {...result, reason:'source_mismatch'};
  }
  if (!Number.isFinite(R) || !Number.isFinite(Z) || R < r[0] || R > r.at(-1) || Z < z[0] || Z > z.at(-1)) {
    return {...result, reason:'outside_grid'};
  }
  const i = interval(r, R), j = interval(z, Z);
  const dr = (R - r[i]) / (r[i + 1] - r[i]), dz = (Z - z[j]) / (z[j + 1] - z[j]);
  const axis = R === geqdsk.rmaxis && Z === geqdsk.zmaxis;
  const psiN = axis ? 0 : lerp(lerp(grid[j][i], grid[j][i + 1], dr),
    lerp(grid[j + 1][i], grid[j + 1][i + 1], dr), dz);
  const flux = {...result, psiN, rhoPol:psiN >= 0 && psiN <= 1 ? Math.sqrt(psiN) : null,
    fluxMethod:axis ? 'geqdsk_axis' : 'bilinear'};
  if (profiles.mapping.cells[j][i] === null || psiN < 0 || psiN > profiles.mapping.corePsiNMax) {
    return {...flux, reason:'masked_cell'};
  }
  const samples = interpolateProfile(profile, psiN);
  if (!samples) return {...flux, reason:'outside_profile'};
  return {...flux, ...samples, valid:true, reason:null};
}

export function validateProfiles(data, field) {
  const {mapping, profiles} = data;
  if (data.schemaVersion !== 1 || data.caseId !== field.caseId || data.equilibriumSha256 !== field.source.sha256 ||
      mapping?.status !== 'reference_flux_mapping' || mapping.profile !== 'TRANSP' ||
      mapping.cellOrder !== '[Z cell][R cell]' || mapping.cellValueOrder?.join(',') !== 'Te_keV,ne_m3' ||
      !(mapping.corePsiNMax > 0 && mapping.corePsiNMax < 1)) {
    throw Error('温密参考与当前 GEQDSK 的来源或映射状态不匹配');
  }
  const axisValid = (array, n) => array.length === n && array[0] === 0 && array.at(-1) === 1 &&
    array.every((v, i) => Number.isFinite(v) && (i === 0 || v > array[i - 1]));
  const positive = values => values.every(v => Number.isFinite(v) && v > 0);
  if (profiles.length !== 2 || profiles.map(p => p.source.model).join(',') !== 'TRANSP,CGYRO' ||
      profiles.some(p => !axisValid(p.rho, p.psiN.length) || !axisValid(p.psiN, p.psiN.length) ||
        p.psiN.length < 2 || p.Te_keV.length !== p.psiN.length || p.ne_m3.length !== p.psiN.length ||
        !positive(p.Te_keV) || !positive(p.ne_m3)) ||
      mapping.cells.length !== field.Z.length - 1 || mapping.cells.some(row =>
        row.length !== field.R.length - 1 || row.some(pair => pair !== null && (pair.length !== 2 || !positive(pair))))) {
    throw Error('温密剖面或 R–Z 掩膜尺寸、数值无效');
  }
}

const quantities = [
  {label:'电子温度 Te', unit:'keV', key:'Te_keV', scale:1,
    colors:[[32,30,72],[96,62,136],[172,79,115],[236,136,87],[255,225,139]]},
  {label:'电子密度 ne', unit:'10¹⁹ m⁻³', key:'ne_m3', scale:NE_DISPLAY,
    colors:[[27,42,69],[37,84,120],[41,139,147],[96,190,157],[219,241,164]]},
];
const fieldColors = [[30,35,65],[61,73,144],[72,143,159],[159,204,138],[255,231,145]];
const fieldQuantities = [
  {label:'径向磁场 Bᵣ',unit:'T',scale:1},
  {label:'垂直磁场 Bz',unit:'T',scale:1},
  {label:'环向磁场 Bφ',unit:'T',scale:1},
  {label:'磁场强度 |B|',unit:'T',scale:1},
  {label:'平衡压力 p',unit:'MPa',scale:1e6},
  {label:'离子温度 Ti',unit:'keV',scale:1,key:'Ti_keV'},
  {label:'环向电流密度 Jφ',unit:'MA/m²',scale:1e6},
].map(q=>({...q,colors:fieldColors}));
const plotStyle = {paper_bgcolor:'transparent', plot_bgcolor:'#111d28', font:{color:'#b7cbd9',size:11}};
const axisStyle = {gridcolor:'#304353',zerolinecolor:'#496274'};
const config = {responsive:true,displaylogo:false,modeBarButtonsToRemove:['sendChartToCloud']};

export function scalarRaster(cells, index, quantity) {
  let min = Infinity, max = -Infinity;
  for (const row of cells) for (const pair of row) {
    if (!Number.isFinite(pair?.[index])) continue;
    const value = pair[index] / quantity.scale;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min)) throw Error('有效色标范围为空');
  const canvas = document.createElement('canvas');
  canvas.width = cells[0].length;
  canvas.height = cells.length;
  const context = canvas.getContext('2d');
  const image = context.createImageData(canvas.width, canvas.height);
  const stops = quantity.colors.length - 1;
  for (const [j, row] of cells.entries()) {
    for (const [i, pair] of row.entries()) {
      if (!Number.isFinite(pair?.[index])) continue;
      const col = max === min ? stops / 2 : ((pair[index] / quantity.scale - min) / (max - min)) * stops;
      const stop = Math.min(Math.floor(col), stops - 1);
      const pixel = ((canvas.height - 1 - j) * canvas.width + i) * 4;
      for (let rgb = 0; rgb < 3; rgb++) {
        image.data[pixel + rgb] = lerp(quantity.colors[stop][rgb], quantity.colors[stop + 1][rgb], col - stop);
      }
      image.data[pixel + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return {
    min,max,url:canvas.toDataURL(),
    colorscale:quantity.colors.map((rgb, i) => [i / stops, `rgb(${rgb.join(',')})`]),
  };
}

async function loadDerivedFields(field, profiles) {
  const response = await fetch(`${import.meta.env.BASE_URL}sparc-prd-fields.json`);
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  const data = await response.json();
  const {cells,validation,Ti_keV} = data;
  if (data.schemaVersion !== 1 || data.caseId !== field.caseId || data.equilibriumSha256 !== field.source.sha256 ||
      data.corePsiNMax !== profiles.mapping.corePsiNMax || data.currentPsiNMax !== .95 ||
      data.order.join(',') !== 'BR_T,BZ_T,Bphi_T,Babs_T,p_Pa,Ti_keV,Jphi_Am2' ||
      validation.status !== 'numerically_cross_checked' ||
      cells.length !== field.Z.length-1 || cells.some((row,j)=>row.length !== field.R.length-1 ||
        row.some((cell,i)=>profiles.mapping.cells[j][i] === null ? cell !== null :
          cell?.length !== 7 || !cell.slice(0,6).every(Number.isFinite) ||
          (cell[6] !== null && !Number.isFinite(cell[6])))) ||
      profiles.profiles.some(p=>Ti_keV[p.source.model]?.length !== p.rho.length ||
        Ti_keV[p.source.model].some(v=>!Number.isFinite(v) || v<=0))) {
    throw Error('派生场与 GEQDSK 网格或参考剖面不匹配');
  }
  return data;
}

export async function mountProfiles({container, field, boundaryTrace, axisTrace, Plotly, observe, isActive,
  samplingScene, onCleanup}) {
  const response = await fetch(`${import.meta.env.BASE_URL}sparc-prd-profiles.json`);
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  const profiles = await response.json();
  if (!isActive()) return;
  validateProfiles(profiles, field);
  let derived, derivedError;
  try {derived = await loadDerivedFields(field,profiles);}
  catch (error) {derivedError = error.message;}
  if (!isActive()) return;
  const comparison = profiles.mapping.freegs.TRANSP;
  container.innerHTML = `
    <h3>R–Z 物理场</h3>
    <label for="prd-field">显示物理量</label>
    <select id="prd-field" disabled><option value="0">电子温度 Te</option><option value="1">电子密度 ne</option></select>
    <p id="prd-field-status" class="physics-only"></p>
    <div id="prd-rz-map" class="science-plot" aria-label="R–Z 物理场"></div>
    <section id="ts-sampling"></section>
    <h3 class="physics-only">电子与离子参考剖面</h3>
    <p class="physics-only">按原始 GACODE ρ 节点绘制，TRANSP 用于空间映射，CGYRO 用于对照。两个文件均未提供 nᵢ 或离子组分。</p>
    <div class="prd-profile-lines physics-only">
      <div id="prd-te-profile" class="science-plot" aria-label="电子温度一维剖面"></div>
      <div id="prd-ne-profile" class="science-plot" aria-label="电子密度一维剖面"></div>
      ${derived?'<div id="prd-ti-profile" class="science-plot" aria-label="离子温度一维剖面"></div>':''}
    </div>
    <h3 class="physics-only">查询物理位置</h3>
    <form id="prd-probe" class="prd-probe physics-only">
      <label>R (m)<input name="R" type="number" step="any" required></label>
      <label>Z (m)<input name="Z" type="number" step="any" required></label>
      <button type="submit">查询</button>
    </form>
    <p id="prd-probe-result" class="physics-only" role="status"></p>
    <details class="physics-only"><summary>剖面来源与坐标依据</summary><p id="prd-profile-sources"></p><p>原始 polflux 单位 Wb/rad，Te、Ti 单位 keV，ne 单位 10¹⁹ m⁻³。径向映射采用各来源自身从轴到边界的归一化极向磁通。</p><p>TRANSP 与 FreeGS 的包围环向磁通归一化曲线最大差 ${comparison.max_normalized_toroidal_flux_difference.toFixed(4)}。局部 q 最大绝对差 ${comparison.max_abs_q_difference.toFixed(3)}。适用等级为公开设计参考映射。</p></details>`;
  const get = selector => container.querySelector(selector);
  const sources = get('#prd-profile-sources');
  for (const source of [...profiles.profiles.map(p => p.source), profiles.license]) {
    const link = document.createElement('a');
    link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = `${source.model ?? source.name} ↗ `;
    sources.append(link);
  }
  const form = get('#prd-probe');
  form.elements.R.value = field.geqdsk.rmaxis;
  form.elements.Z.value = field.geqdsk.zmaxis;
  function showQuery() {
    const sample = queryPrdPosition(field, profiles, form.elements.R.valueAsNumber, form.elements.Z.valueAsNumber);
    const fmt = x => x === null ? '—' : x.toPrecision(6);
    const status = sample.valid
      ? `Te ${fmt(sample.Te_keV)} keV · ne ${fmt(sample.ne_m3 / NE_DISPLAY)} ×10¹⁹ m⁻³ · TRANSP 参考映射`
      : sample.reason === 'outside_grid' ? '超出 GEQDSK 网格' : '温密不可用 · 超出闭合核心映射域';
    const index = Number(select.value)-quantities.length;
    const cell = sample.valid && derived?.cells[interval(field.Z,sample.Z)][interval(field.R,sample.R)];
    const q = fieldQuantities[index];
    const extra = q && Number.isFinite(cell?.[index])
      ? ` · 所在单元中心 ${q.label} ${fmt(cell[index]/q.scale)} ${q.unit}`
      : q ? ' · 所选物理量在当前位置无展示值' : '';
    get('#prd-probe-result').textContent = `ψₙ ${fmt(sample.psiN)} · ρpol ${fmt(sample.rhoPol)} · ${status}${extra}`;
  }
  form.addEventListener('submit', event => { event.preventDefault(); showQuery(); });

  const map = get('#prd-rz-map');
  const select = get('#prd-field');
  const sceneQuantity=document.getElementById('scene-quantity');
  if(sceneQuantity)select.value=sceneQuantity.value;
  const rasters = new Map();
  const allQuantities = derived ? [...quantities,...fieldQuantities] : quantities;
  const options = derived ? fieldQuantities.map((q,i)=>new Option(`${q.label} · ${q.unit}`,i+quantities.length)) : [];
  let physicsQuantity=select.value;
  const showDerivedOptions=()=>{
    const physics=document.querySelector('main')?.dataset.page==='physics';
    for(const option of options) {
      if(physics&&!option.parentNode) select.add(option);
      if(!physics) option.remove();
    }
    select.value=physics ? physicsQuantity : sceneQuantity?.value ?? '0';
  };
  showDerivedOptions();
  showQuery();
  if (derived) {
    const item = document.createElement('details');
    item.className = 'physics-only';
    const v = derived.validation;
    item.innerHTML = `<summary>派生场数值核验</summary>
      <p>Bᵣ、Bz 由原生 ψ 的双三次导数重建，Bφ=F/R。ψ 为每弧度磁通，使用文件原符号。磁轴 Bφ=${v.axisBphi_T.toFixed(3)} T、极向场 ${(1000*v.axisBp_T).toFixed(3)} mT。R=1.85 m 的真空参考场为 ${v.vacuumAtR185_T.toFixed(3)} T。</p>
      <p>极向分量与中心差分相对 L₂ 差 ${(100*v.fdBpRelativeL2).toFixed(2)}%，离散 ∇·B 的 RMS 为 ${v.divergenceRms_T_per_m.toPrecision(3)} T/m。</p>
      <p>Jφ 来自 curl B，对照 GEQDSK p′ 和 FF′ 的 GS 源项，相对 L₂ 差 ${(100*v.gsCurrentRelativeL2).toFixed(2)}%。LCFS 面积积分 ${(v.lcfsAreaCurrent_A/1e6).toFixed(4)} MA，边界环量 ${(v.lcfsLineCurrent_A/1e6).toFixed(4)} MA，文件电流 ${(v.geqdskCurrent_A/1e6).toFixed(2)} MA。二维 Jφ 仅显示到 ψₙ=${derived.currentPsiNMax}，边缘与 X 点局部导数待验证。</p>`;
    container.append(item);
  }
  const {R, Z, plasmaBoundary} = field;
  let samplingTraces = [], samplingRevision = 0;
  const coreRange = (index, padding, overlay) => {
    const values = plasmaBoundary.map(point => point[index]);
    const range = [Math.min(...values) - padding, Math.max(...values) + padding];
    if (!overlay.length) return range;
    const extent = overlay.flatMap(trace=>index===0?trace.x:trace.y);
    return [Math.min(range[0],Math.min(...extent)-.05),Math.max(range[1],Math.max(...extent)+.05)];
  };
  function renderMap() {
    const index = Number(select.value);
    const showSampling=document.querySelector('main')?.dataset.page==='diagnostics';
    const overlay=showSampling?samplingTraces:[];
    const quantity = allQuantities[index];
    const fieldIndex = index-quantities.length;
    if (!rasters.has(index)) rasters.set(index,fieldIndex<0 ?
      scalarRaster(profiles.mapping.cells,index,quantity) : scalarRaster(derived.cells,fieldIndex,quantity));
    const {min,max,url,colorscale} = rasters.get(index);
    const origin = index<2 || fieldIndex===5 ? 'TRANSP 公开参考 · 归一化极向磁通映射' :
      fieldIndex===4 ? 'GEQDSK 平衡压力 p(ψ) · 闭合磁面映射' :
      'GEQDSK 平衡派生 · 已作数值交叉校验';
    const limit = fieldIndex===6 ? derived.currentPsiNMax : profiles.mapping.corePsiNMax;
    get('#prd-field-status').textContent = `${origin} · 有效单元中心 · ψₙ ≤ ${limit}。${derivedError?' 派生场暂不可用。':''}`;
    const colorbar = {type:'scatter',mode:'markers',x:[R[0],R[0]],y:[Z[0],Z[0]],hoverinfo:'skip',
      marker:{size:0,color:[min,max],cmin:min,cmax:max,colorscale,showscale:true,
        colorbar:{title:{text:quantity.unit},thickness:10,len:.75}}};
    return Plotly.react(map, [boundaryTrace,axisTrace,colorbar,...overlay], {
      ...plotStyle,width:map.clientWidth||map._fullLayout?.width||450,height:map.clientHeight||map._fullLayout?.height||320,showlegend:false,
      clickanywhere:showSampling && import.meta.env.MODE==='public-preview',
      margin:{l:48,r:68,t:15,b:53},uirevision:`${field.caseId}:${samplingRevision}:${showSampling}`,
      xaxis:{...axisStyle,title:{text:'R (m)'},range:coreRange(0,.25,overlay),constrain:'domain'},
      yaxis:{...axisStyle,title:{text:'Z (m)'},range:coreRange(1,.30,overlay),scaleanchor:'x',scaleratio:1,constrain:'domain'},
      images:[{source:url,xref:'x',yref:'y',x:R[0],y:Z.at(-1),
        sizex:R.at(-1)-R[0],sizey:Z.at(-1)-Z[0],sizing:'stretch',xanchor:'left',yanchor:'top',layer:'below'}],
    }, config);
  }

  const lineQuantities = derived ? [...quantities,fieldQuantities[5]] : quantities;
  const lines = lineQuantities.map((quantity, index) => {
    const plot = get(['#prd-te-profile','#prd-ne-profile','#prd-ti-profile'][index]);
    const traces = profiles.profiles.map((p, i) => ({
      type:'scatter',mode:'lines',name:p.source.model,x:p.rho,
      y:(p[quantity.key] ?? derived.Ti_keV[p.source.model]).map(v => v / quantity.scale),
      line:{color:i ? '#c7a7e4' : '#78d3bd',dash:i ? 'dash' : 'solid',simplify:false},
    }));
    const draw = Plotly.newPlot(plot, traces, {
      ...plotStyle,width:plot.clientWidth,height:plot.clientHeight,margin:{l:58,r:14,t:18,b:80},
      xaxis:{...axisStyle,title:{text:'GACODE ρ'},range:[0,1]},
      yaxis:{...axisStyle,title:{text:`${quantity.label} (${quantity.unit})`},rangemode:'tozero'},
      legend:{orientation:'h',xref:'container',x:.035,yref:'container',y:.015,yanchor:'bottom'},
    }, config);
    return {plot,draw};
  });
  const plots = [map,...lines.map(line => line.plot)];
  try {
    await Promise.all([renderMap(),...lines.map(line => line.draw)]);
    if (!isActive()) {
      for (const el of plots) Plotly.purge(el);
      return;
    }
    for (const el of plots) observe(Plotly, el);
    const updateMap=()=>renderMap().catch(error=>{
      if (isActive()) get('#prd-probe-result').textContent = `图形切换失败。 ${error.message}`;
    });
    const syncFromScene=()=>{
      if(document.querySelector('main')?.dataset.page==='physics') return;
      if(sceneQuantity.value!==select.value){select.value=sceneQuantity.value;updateMap();}
    };
    const syncPage=()=>{showDerivedOptions();showQuery();updateMap();};
    sceneQuantity?.addEventListener('change',syncFromScene);
    document.addEventListener('workspace-page-change',syncPage);
    onCleanup(()=>{sceneQuantity?.removeEventListener('change',syncFromScene);document.removeEventListener('workspace-page-change',syncPage);});
    select.addEventListener('change',()=>{
      if(document.querySelector('main')?.dataset.page==='physics') physicsQuantity=select.value;
      if(sceneQuantity&&Number(select.value)<quantities.length&&sceneQuantity.value!==select.value){
        sceneQuantity.value=select.value;sceneQuantity.dispatchEvent(new Event('change'));
      }
      showQuery();
      updateMap();
    });
    syncPage();
    select.disabled=false;

    const releaseSection=samplingScene?.attachSection?.(field,profiles,quantities);
    if(releaseSection) onCleanup(releaseSection);
    if (!samplingScene) return;
    const host=get('#ts-sampling'), empty=samplingScene.controlsHost?.querySelector('#diagnostic-empty');
    const initialMessage=empty?.textContent;
    let cleanupSampling;
    onCleanup(()=>{
      cleanupSampling?.();
      host.remove();
      if(empty) {empty.hidden=false;empty.textContent=initialMessage;}
    });
    try {
      const {mountDiagnostics}=await import('#diagnostic-workspace');
      if(!isActive()) return;
      samplingScene.controlsHost?.append(host);
      cleanupSampling=await mountDiagnostics({
        host,field,query:(R,Z) => queryPrdPosition(field,profiles,R,Z),
        ...samplingScene,map,isActive,Plotly,
        updateOverlay:async (traces,fit) => {
          samplingTraces = traces;
          if (fit) samplingRevision++;
          if (isActive()) await renderMap();
        },
      });
      if (!isActive()) {cleanupSampling?.();return;}
      if(empty) empty.hidden=true;
    } catch (error) {
      if(!isActive()) return;
      host.remove();
      if(empty) empty.textContent=`TS 数据或图表不可用。 ${error.message}`;
    }
  } catch (error) {
    for (const el of plots) Plotly.purge(el);
    throw error;
  }
}
