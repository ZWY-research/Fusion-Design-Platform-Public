// Static, curated evidence only. This module never calls a physics solver.
import {cases,data,fuelApplicability,mountResearchScience} from '#workspace-data';
export {cases};
let plotlyPromise;
export const loadPlotly = () => plotlyPromise ??= import('plotly.js-basic-dist-min').then(m => m.default);
let generation = 0;
const cleanup = [];
export async function showScience(caseId,candidate=null,samplingScene) {
  const version = ++generation, current = candidate??cases.find(c => c.caseId === caseId);
  cleanup.splice(0).forEach(fn => fn());
  const host = document.getElementById('science-data');
  host.replaceChildren();
  document.querySelector('.metrics').hidden = !!current;
  document.querySelector('.result-note').hidden = !!current;
  document.getElementById('science-status').textContent = current ? current.resultKind : '未接入物理求解器';
  if (!current) return;
  const text = (tag, value, parent = host) => { const el = document.createElement(tag); el.textContent = value; parent.append(el); return el; };
  if (mountResearchScience({
    current, host, text, samplingScene, loadPlotly,
    isActive:()=>version===generation, onCleanup:fn=>cleanup.push(fn),
    observe:(Plotly,el)=>observePlot(Plotly,el,false),
    lineTrace, showCandidate:()=>showCandidate(current,host,text),
  })) return;
  if (current.equilibrium) return showEquilibrium(current, text, version, samplingScene);
  if (import.meta.env.MODE === 'public-preview') return;
  if(current.candidate_id){showCandidate(current,host,text);return;}
  if(current.presetFields){text('h3','参考字段与自动填充来源');for(const [key,q]of Object.entries(current.presetFields))text('p',key+' = '+(q.value??'未知')+' '+q.unit+' · '+q.definition+' · '+q.kind+' · '+q.source);text('p',fuelApplicability(current.target.fuel));if(!current.results){for(const id of current.sourceIds){const source=data.sources[id];const a=text('a',source.title+' ↗ ');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';}text('p',current.validation);return;}}

  text('h3', current.label);
  text('p', `${current.resultKind}。ne=${(current.physical.ne/1e20).toFixed(4)} ×10²⁰ m⁻³；Te=${current.physical.Te.toFixed(4)} keV；B₀=${current.physical.B0} T；Ip=${current.physical.Ip} MA；H98=${current.physical.H98}；${current.physical.fuel}。`);
  const values = current.results;
  text('p', `Pfusion=${values.P_fusion_MW.toFixed(3)} MW；Qabs=${values.Q_absorbed.toFixed(3)}；Qlaunch=${values.Q_launched == null ? '未给出（不换算文献值）' : values.Q_launched.toFixed(3)}；τE=${values.tau_E_s.toFixed(5)} s。`);
  text('p', 'Qabs=Pfusion/(Pohm+RFabs)；Qlaunch=Pfusion/(Pohm+RFlaunch)。两套参考工况不能混用。');
  text('p', current.validation); text('p', current.constraints);
  text('p', `几何来源：${current.geometrySource}。线圈与真空室仍为通用示意。缺失：${current.missing.join('；')}。`);
  const sources = text('p', '来源：');
  for (const id of current.sourceIds) { const s = data.sources[id]; const a = document.createElement('a'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = `${s.title ?? 'cfspopcon'} ${s.version ?? ''} ↗ `; sources.append(a); }
  text('p', '独立公开资料研究，与 MIT/CFS 无隶属或官方背书关系。本地静态证据展示；未执行在线计算，未复现完整工程装置。');
  if (caseId !== 'sparc-prd') { text('p', 'V2 历史运行空间数据不足，暂不绘制 POPCON；不以当前 PRD 替代。'); return; }
  text('h3', '网格敏感性 · 不同最优节点，不是固定点误差');
  const grid = text('div', ''); grid.className = 'science-plot'; grid.setAttribute('aria-label', '真实计算网格敏感性图');
  text('p', '来源：Phase 2 physics_validation.json / experiment_B；相同模型及范围，非嵌套网格。连线仅辅助阅读，未证明收敛。');
  text('h3', 'POPCON 采样 · 原始 40×30（无插值）');
  const pop = text('div', ''); pop.className = 'science-plot'; pop.setAttribute('aria-label', 'POPCON 原始节点和完整约束筛选图');
  text('p', '来源：原始 official_grid.csv（1200 节点）；灰点未通过完整 PRD 筛选，彩点通过筛选并显示 Qlaunch。仅为该模型筛选，不是物理可行性证明。');
  const layout = {paper_bgcolor:'transparent',plot_bgcolor:'transparent',font:{color:'#b7cbd9',size:11},margin:{l:65,r:55,t:25,b:70},legend:{orientation:'h',y:-.22},xaxis:{gridcolor:'#304353'},yaxis:{gridcolor:'#304353'},autosize:true};
  try {
    const Plotly = await loadPlotly(); if (version !== generation) return;
    const rows = data.gridSensitivity, x = rows.map(r => r.shape.join('×'));
    await Plotly.newPlot(grid, [
      {x,y:rows.map(r=>r.selected.P_fusion_MW),name:'Pfusion / MW',type:'scatter',mode:'lines+markers',line:{color:'#bca47c'}},
      ...['Q_absorbed','Q_launched'].map((k,i)=>({x,y:rows.map(r=>r.selected[k]),name:k==='Q_absorbed'?'Qabs / 1':'Qlaunch / 1',yaxis:'y2',type:'scatter',mode:'lines+markers',line:{color:i?'#66cbb5':'#7fa9db'}}))
    ],{...layout,width:grid.clientWidth,xaxis:{title:{text:'扫描网格 / 节点数'}},yaxis:{title:{text:'Pfusion / MW'},gridcolor:'#304353'},yaxis2:{title:{text:'Q / 无量纲'},overlaying:'y',side:'right'}},{responsive:true,displaylogo:false});
    if (version !== generation) { Plotly.purge(grid); return; }
    const allowed = data.popcon.points.filter(p=>p[4]), excluded = data.popcon.points.filter(p=>!p[4]);
    await Plotly.newPlot(pop,[
      {x:excluded.map(p=>p[1]),y:excluded.map(p=>p[0]),type:'scatter',mode:'markers',name:'未通过筛选',marker:{size:3,color:'#536578'},hovertemplate:'Te=%{x:.3f} keV<br>ne=%{y:.3f} ×10²⁰ m⁻³<br>未通过完整筛选<extra></extra>'},
      {x:allowed.map(p=>p[1]),y:allowed.map(p=>p[0]),customdata:allowed.map(p=>[p[2],p[3]]),type:'scatter',mode:'markers',name:'通过筛选',marker:{size:7,color:allowed.map(p=>p[3]),colorscale:'Viridis',showscale:true,colorbar:{title:{text:'Qlaunch / 1'},thickness:10}},hovertemplate:'Te=%{x:.3f} keV<br>ne=%{y:.3f} ×10²⁰ m⁻³<br>Pfusion=%{customdata[0]:.3f} MW<br>Qlaunch=%{customdata[1]:.3f}<extra></extra>'}
    ],{...layout,width:pop.clientWidth,xaxis:{title:{text:'体积平均 Te / keV'},gridcolor:'#304353'},yaxis:{title:{text:'体积平均 ne / 10²⁰ m⁻³'},gridcolor:'#304353'}},{responsive:true,displaylogo:false});
    if (version !== generation) { Plotly.purge(grid); Plotly.purge(pop); return; }
    for (const el of [grid,pop]) observePlot(Plotly, el);
  } catch { if (version === generation) text('p', '图表加载失败；上方来源与数值仍可查阅。'); }
}

function observePlot(Plotly, el, track = true) {
  const observer = new ResizeObserver(() => {
    if (el.isConnected && el.clientWidth) {
      Plotly.relayout(el, {width:el.clientWidth, height:el.clientHeight});
    }
  });
  observer.observe(el);
  const stop=() => { observer.disconnect(); Plotly.purge(el); };
  if(track) cleanup.push(stop);
  return stop;
}

async function loadEquilibrium(current) {
  const response = await fetch(`${import.meta.env.BASE_URL}${current.equilibrium.asset}`);
  if (!response.ok) throw Error(`GEQDSK 数据请求失败（HTTP ${response.status}）`);
  const field = await response.json();
  if (field.schemaVersion !== 1 || field.caseId !== current.caseId ||
      field.source?.sha256 !== current.equilibrium.sourceSha256 ||
      field.validation?.status !== 'checked_against_geqdsk') {
    throw Error('平衡版本、来源或验证状态不匹配');
  }
  const { R, Z, geqdsk, units, flux, psi, psi_N, contours } = field;
  const { nw, nh, rmaxis, zmaxis, simag, sibry } = geqdsk;
  const axisValid = (coords, n, axis) => Number.isInteger(n) && n >= 2 && coords.length === n &&
    coords.every((v, i) => Number.isFinite(v) && (i === 0 || v > coords[i - 1])) &&
    axis >= coords[0] && axis <= coords[n - 1];
  const matrixValid = matrix => matrix.length === nh &&
    matrix.every(row => row.length === nw && row.every(Number.isFinite));
  const lineValid = line => line.every(p => p.length === 2 && p.every(Number.isFinite));
  if (units.R !== 'm' || units.Z !== 'm' || units.psi !== 'Wb/rad' || units.psi_N !== '1' ||
      flux.order !== '[Z][R]' || !axisValid(R, nw, rmaxis) || !axisValid(Z, nh, zmaxis) ||
      !Number.isFinite(sibry - simag) || Math.abs(sibry - simag) <= 1e-12 ||
      !matrixValid(psi) || !matrixValid(psi_N) ||
      !lineValid(field.plasmaBoundary) || !lineValid(field.limiter) ||
      !contours.every(c => Number.isFinite(c.level) && c.lines.every(lineValid)) ||
      !Object.keys(current.geometry).every(key => current.geometry[key] === field.displayGeometry[key])) {
    throw Error('GEQDSK 网格、物理坐标或等值线数据无效');
  }
  return field;
}

function lineTrace(lines, name, color, dash = 'solid', width = 1.3, coordinates = 'rz') {
  const x = [], y = [];
  for (const line of lines) {
    for (const [r, z] of line) { x.push(r); y.push(z); }
    x.push(null); y.push(null);
  }
  return {
    x, y, name, type:'scatter', mode:'lines', connectgaps:false,
    line:{color,dash,width,shape:'linear',simplify:false},
    hovertemplate:(coordinates==='popcon'
      ? '体积平均 Te=%{x:.4f} keV<br>体积平均 ne=%{y:.4f} ×10²⁰ m⁻³'
      : 'R=%{x:.4f} m<br>Z=%{y:.4f} m')+'<extra>%{fullData.name}</extra>',
  };
}

async function showEquilibrium(current, text, version, samplingScene) {
  text('h3', 'SPARC PRD · FreeGS 双零磁平衡').classList.add('physics-only');
  const status = text('p', '正在读取 CFS SPARCPublic 公开设计参考…');
  status.classList.add('physics-only');
  const plot = text('div', '');
  plot.id = 'equilibrium-plot';
  plot.className = 'science-plot';
  plot.setAttribute('aria-label', 'SPARC PRD 极向磁通等值线、磁轴、等离子体边界和限制器');
  try {
    const [field, Plotly] = await Promise.all([loadEquilibrium(current), loadPlotly()]);
    if (version !== generation) return;
    const { R, Z, geqdsk, source } = field;
    const { nw, nh, rmaxis, zmaxis, Ip_A, p_axis_Pa } = geqdsk;
    status.textContent = `CFS SPARCPublic 公开设计参考 · GEQDSK 数值核验通过。原生 ${nw}×${nh} 网格；Ip=${(Ip_A/1e6).toFixed(2)} MA，轴压 ${(p_axis_Pa/1e6).toFixed(2)} MPa，磁轴 (${rmaxis.toFixed(4)}, ${zmaxis.toFixed(5)}) m。`;
    const colors = ['#73c3c1','#81b9d5','#9aaee0','#b2a4e2','#ceb0e5'];
    const traces = field.contours.map(({level,lines}, i) => level === 1
      ? lineTrace(lines, 'ψₙ = 1 · 网格', '#ffd06e', 'solid', 2)
      : lineTrace(lines, `ψₙ = ${level}`, colors[i]));
    const boundaryTrace = lineTrace([field.plasmaBoundary], '文件边界', '#8cf3d2', 'dot', 2.5);
    if (field.plasmaBoundary.length) traces.push(boundaryTrace);
    if (field.limiter.length) traces.push(lineTrace([field.limiter], '文件限制器', '#a6b8c5', 'dash', 1.5));
    const axisTrace = {
      x:[rmaxis], y:[zmaxis], name:'磁轴', type:'scatter', mode:'markers',
      marker:{color:'#ff9e8e',size:10,symbol:'cross'},
      hovertemplate:'R=%{x:.6f} m<br>Z=%{y:.6f} m<extra>磁轴</extra>',
    };
    traces.push(axisTrace);
    const axis = {gridcolor:'#304353',zerolinecolor:'#496274',constrain:'domain'};
    await Plotly.newPlot(plot, traces, {
      width:plot.clientWidth, height:plot.clientHeight,
      paper_bgcolor:'transparent', plot_bgcolor:'#111d28',
      font:{color:'#b7cbd9',size:11}, margin:{l:54,r:16,t:12,b:168},
      hovermode:'closest',
      legend:{orientation:'h',xref:'container',x:.025,yref:'container',y:.025,yanchor:'bottom',entrywidth:86},
      xaxis:{...axis,title:{text:'R (m)'},range:[R[0],R.at(-1)]},
      yaxis:{...axis,title:{text:'Z (m)'},range:[Z[0],Z.at(-1)],scaleanchor:'x',scaleratio:1},
    }, {responsive:true,displaylogo:false,modeBarButtonsToRemove:['sendChartToCloud']});
    if (version !== generation) { Plotly.purge(plot); return; }
    observePlot(Plotly, plot);
    text('p', '内部曲线为围绕磁轴的闭合磁面。ψ_N=1 保留原网格的全部分支，X 点附近的离散断口按原样显示。三维采用同一米制 Z-up 坐标，D 形外壳为边界尺寸示意。数据为公开设计计算参考。').classList.add('physics-only');
    const citation = text('p', '来源 ');
    citation.classList.add('physics-only');
    for (const [label, url] of [[source.path, source.url], [source.license + ' 许可', source.license_url]]) {
      const a = text('a', `${label} ↗ `, citation);
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    }
    const details = text('details', '');
    details.classList.add('physics-only');
    text('summary', '版本与数值核验', details);
    text('p', `固定提交 ${source.commit}；SHA-256 ${source.sha256}。`, details);
    text('p', `原始 ψ 保留 FreeGS 符号与零点，单位 Wb/rad。ψ_N = (ψ − simag)/(sibry − simag)。文件边界到 ψ_N=1 网格曲线的最大距离 ${(field.validation.boundary_max_distance_to_grid_contour_m * 1000).toFixed(2)} mm。上下鞍点均通过网格尺度核验。`, details);
    const container = text('section', '');
    container.id = 'prd-profiles';
    const isActive = () => version === generation;
    import('./prd-profiles.js').then(({mountProfiles}) => {
      if (isActive()) return mountProfiles({container,field,boundaryTrace,axisTrace,Plotly,
        observe:observePlot,isActive,samplingScene,onCleanup:fn => cleanup.push(fn)});
    }).catch(error => {
      if (!isActive()) return;
      container.replaceChildren();
      text('p', `PRD 温密数据不可用。 ${error.message}`, container).setAttribute('role','alert');
    });
  } catch (error) {
    if (version !== generation) return;
    plot.remove();
    status.setAttribute('role', 'alert');
    status.classList.remove('physics-only');
    status.textContent = `SPARC PRD 平衡加载或绘图失败。 ${error.message}`;
    document.getElementById('science-status').textContent = '参考平衡不可用';
  }
}

function showCandidate(c,host,text){
  const r=c.candidateEvidence;
  text('h3',c.label);text('p',`${r.candidate_id} · 模型 ${r.model_branch} / adapter ${r.model_version} · ${r.solver_status} · ${c.resultKind}`);
  if(r.classification!=='model_pass')text('p','本点未通过模型筛选。下列为原始模型估算，不能解释为可运行性能或可实现增益。');
  text('p',`输入体积平均 ne=${(c.physical.ne/1e20).toFixed(4)} ×10²⁰ m⁻³；Te=${c.physical.Te.toFixed(5)} / Ti=${c.physical.Ti.toFixed(5)} keV；BT=${c.physical.B0} T；Ip=${c.physical.Ip} MA。κsep=${c.geometry.kappa}，δsep=${c.geometry.delta}。`);
  const metrics=text('div','');metrics.className='candidate-metrics';metrics.id='candidate-metrics';
  const keys={P_fusion_MW:'聚变功率',Q_absorbed:'Qabs',Q_launched:'Qlaunch',P_RF_absorbed_MW:'吸收 RF',P_RF_launched_MW:'发射 RF',P_ohmic_MW:'欧姆加热',P_alpha_deposited_MW:'Alpha 沉积',P_radiation_MW:'芯部辐射',P_SOL_MW:'分离面输运功率',W_thermal_MJ:'热储能',tau_E_s:'所选定义 τE',plasma_volume_m3:'等离子体体积'};
  const fmt=v=>v==null?'未计算':Number(v).toPrecision(7);
  for(const [key,label]of Object.entries(keys)){const q=r.results[key];const card=text('article','',metrics);card.dataset.quantity=key;text('span',label,card);text('strong',`${fmt(q?.value)} ${q?.unit??''}`,card);text('p',q?.definition??'未计算',card);}
  text('p','Qabs=Pf/(Pohm+RFabs)，Qlaunch=Pf/(Pohm+RFlaunch)。RFlaunch 不是墙插功率。τE 的密度/功率口径依明确分支，不混用 PRD 与 V2。');
  text('h3','逐项约束与裕量 · 仅所选模型的数值筛选');
  const wrap=text('div','');wrap.className='table-scroll';const table=text('table','',wrap);table.id='candidate-constraints';
  const header=text('tr','',table);for(const s of ['约束 / 状态','计算值 / 单位','下限 / 上限','下侧 / 上侧裕量','模型与适用条件'])text('th',s,header);
  for(const q of r.constraints){const tr=text('tr','',table);tr.dataset.constraint=q.name;tr.dataset.passed=String(q.passed);
    for(const value of [`${q.name} · ${q.passed===true?'通过':q.passed===false?'不通过':'未评价'}`,`${fmt(q.value)} ${q.unit}`,`${q.min==null?'无':fmt(q.min)} / ${q.max==null?'无':fmt(q.max)}`,`${q.margins.lower==null?'—':fmt(q.margins.lower)} / ${q.margins.upper==null?'—':fmt(q.margins.upper)}`,`${q.model}；${q.applicability}`])text('td',value,tr);}
  const details=text('details','');text('summary','模型假设、未验证项及数据来源',details);
  for(const note of [...r.model.assumptions,...r.limitations])text('p',note,details);
  text('p',`模型：${JSON.stringify(r.model.settings)}`,details);
  text('p',`未验证：${r.unverified.join('；')}。${c.validation}`,details);
  text('p',`证据：${r.studyEvidence.source} / SHA-256 ${r.studyEvidence.searchSha256}；原始输入 SHA-256 ${r.evidence.inputSha256}；候选完整计算 SHA-256 ${r.evidence.forwardResultSha256}；cfspopcon ${r.studyEvidence.cfspopconVersion}。公开节选可核验，不含完整本地计算环境。`,details);
  for(const source of r.sources){const a=text('a',`${source.title} ↗ `,details);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';}
}
