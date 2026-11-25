import {scalarRaster} from './prd-profiles.js';
import {axis, details, edges, fmt, marker, menu, nearestGridIndex, plot, provenance, quantity, rasterOptions, splitPath, table, theme} from './research-plot-ui.js';

const metrics = {
  P_fusion_MW:quantity('聚变功率','MW'), Q_launched:quantity('Qlaunch','1'), Q_absorbed:quantity('Qabs','1'),
  P_RF_launched_MW:quantity('发射 RF','MW'), P_RF_absorbed_MW:quantity('吸收 RF','MW'),
  P_external_absorbed_MW:quantity('总外部吸收功率','MW'), P_ohmic_MW:quantity('欧姆功率','MW'),
  P_SOL_MW:quantity('分离面输运功率','MW'), P_radiation_MW:quantity('芯部辐射','MW'),
  P_SOL_over_P_LH:quantity('P_SOL / P_LH','1'), greenwald_fraction_volume:quantity('Greenwald 体积密度比例','1'),
  max_flattop_duration_s:quantity('平顶时长估算','s'), tau_E_s:quantity('能量约束时间','s'),
  W_thermal_MJ:quantity('模型热储能','MJ'), W_profile_integral_MJ:quantity('剖面积分储能','MJ'),
  q_star_Uckan:quantity('Uckan q*','1'), beta_N_toroidal_percent:quantity('归一化 β','%·m·T/MA'),
};

export function checkGrid(data, current, shape) {
  const ordered = a => a.every((v,i)=>Number.isFinite(v)&&(!i||v>a[i-1]));
  const [ny,nx] = shape;
  if (data.caseId!==current || data.shape.join()!==shape.join() || data.ne_m3.length!==ny ||
      data.Te_keV.length!==nx || !ordered(data.ne_m3) || !ordered(data.Te_keV) ||
      data.passed.length!==ny*nx || data.passed.some(v=>typeof v!=='boolean') ||
      !Object.values(data.metrics).every(v=>v.length===ny*nx) ||
      !data.metrics.P_fusion_MW || !data.metrics[current==='sparc-prd'?'Q_launched':'Q_absorbed']) {
    throw Error('网格、案例身份或筛选标记不匹配');
  }
  return data;
}

export async function mountPopcon(ctx, signal, load, officialSizes) {
  const {current,text,loadPlotly,isActive,onCleanup,observe,lineTrace}=ctx;
  const official=current.research.id==='A2';
  const sizes=official?officialSizes:[[120,120]];
  const summary=await load(official?'popcon-summary':'reduced',current.caseId,signal);
  if(!isActive()) return;
  text('h3',official?'SPARC PRD · POPCON':'SPARC V2 · 简化温密扫描');
  text('p',official
    ? `cfspopcon ${summary.version} · 固定提交 ${summary.commit.slice(0,7)}。Qlaunch = Pfus/(Pohm + RFlaunch)，Qabs 使用吸收 RF。`
    : `${summary.model} · 本项目简化模型 · 2020 V2 文献参考坐标 · H98 = ${summary.inputs.H98y2}。采用 DT Bosch–Hale、解析 D 形体积与近似径向剖面，完整历史 V2 模型尚未复现。`);
  const {R0,a,kappa,delta}=current.geometry;
  text('p',`参考几何 R₀=${R0} m，a=${a} m，κ=${kappa}，δ=${delta} · B₀=${current.physical.B0} T，Ip=${current.physical.Ip} MA。`);
  const controls=text('div','');controls.className='design-controls';
  const mesh=menu(text,controls,'popcon-mesh','密度 × 温度节点',sizes.map(s=>[s.join('x'),s.join('×')]));
  mesh.disabled=sizes.length===1;
  const metric=menu(text,controls,'popcon-metric','色标',[]);
  const info=text('p','');info.id='popcon-info';info.setAttribute('role','status');
  const view=text('div','');
  const readout=text('div','');readout.id='popcon-point';readout.setAttribute('aria-live','polite');
  if(official){
    const comp=details(text,'B2 · 网格敏感性、原始参考和逐点对照',[
      '四档网格采用相同输入范围和约束。节点随分辨率改变。固定坐标复算与嵌入网格结果一致。全局最优与网格最优收敛尚未证明。',
      `固定上游提交 ${summary.commit}。`,
      ...Object.entries(summary.gridChecks).map(([key,v])=>`上游原始 1,200 节点 · ${metrics[key].label} 最大绝对差 ${fmt(v)} ${metrics[key].unit}。`),
    ]);
    table(text,['网格（ne × Te）','通过','P_fus (MW)','Qlaunch','Qabs','PSOL/PLH'],
      summary.sensitivity.map(e=>[Object.values(e.grid_shape).join('×'),e.allowed_points,
        ...['P_fusion_MW','Q_launched','Q_absorbed','P_SOL_over_P_LH'].map(k=>fmt(e.selected[k]))]),comp);
    const near=summary.probes.find(p=>p.passes_screen)?.metrics;
    text('p',`官方参考 = 原始 40×30 所选节点，P_fus=${fmt(summary.reference.P_fusion_MW)} MW，Qlaunch=${fmt(summary.reference.Q_launched)}。近边界独立单点评价 Qlaunch=${fmt(near?.Q_launched)}，局部交点 Qlaunch=${fmt(summary.boundary.metrics.Q_launched)}。严格开集筛选排除边界交点。`,comp);
    details(text,'B3 · 固定点与储能、约束功率定义',[
      '原始 PRD、100×100 所选坐标及 V2 坐标分别按 1×1 和嵌入网格核对。H98 反解使用 Pin=PSOL+Prad，V2 文献采用旧 PSOL 定义。',
      '参考 V2 坐标的 PRD 模型受 L–H 筛选与 RF 截断限制，原始 Q 缺少可运行性能的解释。',
    ]);
    details(text,'B4 · 组分、密度与功率闭合',[
      '节点 01C 保留组分、电荷中性和功率收支独立核对。cfspopcon 的末态 Ar 组分未回算芯部辐射、Zeff 或聚变，芯部–SOL 的自洽杂质反馈仍缺。',
      '平顶时长零线为上游绘图参考，实际 PRD 选点掩膜使用 RF、Greenwald、L–H 和聚变功率四项。',
    ]);
    provenance(text,summary.sources);
  }else{
    const paragraphs=[
      'DT Bosch–Hale 反应率与固定 cfspopcon 源码逐点对照。历史单元测试还以 SciPy 自适应积分独立复核。',
      '0D 储能采用体积平均量。另保存近似剖面的储能积分作为定义对照。缺少完整历史 V2 体积、储能、线平均密度转换与辐射模型。',
    ];
    if(summary.quadrature) paragraphs.splice(1,0,
      `径向区间 ${summary.quadrature.radial_intervals.join(' → ')}。参考点 P_fus、Prad、Qabs 的相对变化为 ${['P_fusion_MW','P_radiation_MW','Q_absorbed'].map(k=>fmt(summary.quadrature.relative_change[k])).join(' / ')}。`);
    const evidence=details(text,'B1 · Bosch–Hale 与简化积分核验',paragraphs);
    table(text,['量','V2 文献值','同坐标简化模型值'],
      ['P_fusion_MW','Q_absorbed','tau_E_s'].filter(k=>k in summary.reference.values && k in current.results)
        .map(k=>[metrics[k].label,fmt(current.results[k]),fmt(summary.reference.values[k])]),evidence);
    if(summary.inputs.Z_effective!=null) details(text,'固定物理假设',[
      `B₀=${summary.inputs.B0_T} T，Ip=${summary.inputs.Ip_MA} MA，H98=${summary.inputs.H98y2}，Ti/Te=${summary.inputs.Ti_over_Te}，D:T=50:50。Te 峰化 ${summary.inputs.temperature_peaking}，n_fuel/ne=${summary.inputs.fuel_density_over_electron_density}，Zeff=${summary.inputs.Z_effective}。`,
      '筛选使用 L–H、Greenwald、聚变及外部功率约束。β_N 上限在原结果中未设定。',
    ]);
    provenance(text,summary.sources);
  }
  for(const id of current.sourceIds){
    const a=text('a',id==='cfspopcon'?'固定上游提交':'2020 V2 文献 ↗');
    a.href=id==='cfspopcon'? `https://github.com/cfs-energy/cfspopcon/tree/${summary.commit}`
      : id==='creely2020'?'https://doi.org/10.1017/S0022377820001257':'https://doi.org/10.1017/S0022377820001075';
    a.target='_blank';a.rel='noopener noreferrer';
  }

  const Plotly=await loadPlotly();
  if(!isActive()) return;
  let meshRequest, disposePlot, pointKind = 'optimum';
  onCleanup(()=>{meshRequest?.abort();disposePlot?.();});
  async function drawMesh(){
    meshRequest?.abort();disposePlot?.();disposePlot=undefined;
    const request=new AbortController();
    meshRequest=request;
    const live=()=>isActive()&&!request.signal.aborted;
    const label=mesh.value;
    const gain=official?'Q_launched':'Q_absorbed';
    info.textContent='正在读取已保存网格…';
    readout.replaceChildren();view.replaceChildren();
    metric.disabled=true;
    try{
      const grid=checkGrid(official?await load(`popcon-${label}`,current.caseId,request.signal):summary,
        current.caseId,label.split('x').map(Number));
      if(!live())return;
      const y=grid.ne_m3.map(n=>n/1e20), x=grid.Te_keV, ref=official?summary.reference:summary.reference.values;
      const target=summary.probes?.find(p=>p.passes_screen)?.metrics;
      const passes=grid.passed.reduce((n,v)=>n+Number(v),0);
      const selected=grid.selected;
      const menuValue=metric.value || gain;
      metric.replaceChildren(...Object.keys(metrics).filter(k=>grid.metrics[k]).map(k=>new Option(metrics[k].label,k)));
      metric.value=menuValue; metric.disabled=false;
      info.textContent=`${grid.shape.join('×')} · ${grid.passed.length.toLocaleString()} 个节点，${passes.toLocaleString()} 个通过。灰格为筛选未通过，边界线按格点等值插值。点击标记可选取对应记录，点击其他位置则查询最近网格节点。`;
      const shortcuts=text('div','',view);
      shortcuts.className='popcon-shortcuts';
      const referenceButton=text('button',official?'官方参考选点':'文献坐标计算',shortcuts);
      const optimumButton=text('button','本档最优节点',shortcuts);
      const nearby=target&&text('button','直接近边界点',shortcuts);
      for(const button of shortcuts.children) button.className='secondary';
      const graph=plot(text,'popcon-plot','温度与密度运行空间',view);
      const records = {
        reference:{point:ref,title:official?'官方参考（40×30）':'V2 文献坐标的简化模型结果',
          passed:official?summary.referencePassed:summary.reference.passes_reduced_screen,color:'#ffb08e',symbol:'x'},
        optimum:{point:selected,title:'本档网格最优',passed:true,color:'#e7f5e2',symbol:'diamond-open'},
      };
      if(target) records.direct={point:target,title:'近边界直接计算（独立点）',passed:true,color:'#ffd789',symbol:'triangle-up-open'};
      const points=Object.entries(records).map(([key,{point,title,color,symbol}])=>({
        ...marker(point.Te_volume_keV,point.ne_volume_m3/1e20,title,color,symbol),customdata:[key],
      }));
      const bounds=grid.contours.map(({key,level,lines},i)=>lineTrace(lines,`${metrics[key].label} = ${level}`,
        ['#e8b07e','#b98ecc','#89aedf','#97d4b1','#d5c783','#a4a5ac'][i%6],'dot',1.3,'popcon'));
      let cursor={...selected,passed:true}, tag='本档网格最优';
      function showPoint(point, title, passed, kind){
        cursor=point;tag=title;pointKind=kind;
        readout.replaceChildren();
        text('h3',`${title} · ${passed?'筛选通过':'筛选未通过'}`,readout);
        text('p',`⟨Te⟩=${fmt(point.Te_volume_keV,9)} keV · ⟨ne⟩=${fmt(point.ne_volume_m3/1e20,9)} ×10²⁰ m⁻³。`,readout);
        table(text,['物理量','数值','单位'],Object.entries(metrics).filter(([k])=>k in point)
          .map(([k,q])=>[q.label,fmt(point[k]),q.unit]),readout);
        provenance(text,kind==='direct'||kind==='reference'?summary.sources:grid.sources,readout);
      }
      function choose(key){
        const {point,title,passed}=records[key];
        showPoint(point,title,passed,key);
      }
      const xEdges=edges(x),yEdges=edges(y);
      let cachedMetric, image;
      async function draw(){
        const key=metric.value,q=metrics[key];
        if(key!==cachedMetric){
          const values=grid.metrics[key];
          const cells=y.map((_,j)=>x.map((_,i)=>{const index=j*x.length+i;return grid.passed[index]?[values[index]]:null;}));
          image=rasterOptions(scalarRaster(cells,0,q),q,xEdges,yEdges);
          cachedMetric=key;
        }
        const backdrop={type:'scatter',mode:'markers',hoverinfo:'skip',showlegend:false,
          x:[xEdges[0],xEdges.at(-1)],y:[yEdges[0],yEdges.at(-1)],marker:{size:0}};
        const pick=marker(cursor.Te_volume_keV,cursor.ne_volume_m3/1e20,tag,'#ffffff','circle-open');
        pick.showlegend=false;
        pick.customdata=[pointKind];
        await splitPath(Plotly,graph,[backdrop,image.colorbar,...bounds,...points,pick],
          '体积平均 Te (keV)','体积平均 ne (10²⁰ m⁻³)',{clickanywhere:true,uirevision:label,
            margin:{...theme.margin,b:115},legend:{orientation:'h',y:-.21},plot_bgcolor:'#34404b',
            images:[image.image],xaxis:{...axis('体积平均 Te (keV)'),range:[xEdges[0],xEdges.at(-1)]},
            yaxis:{...axis('体积平均 ne (10²⁰ m⁻³)'),range:[yEdges[0],yEdges.at(-1)]}});
      }
      const redraw=()=>draw().catch(error=>{if(live())info.textContent=`绘图失败。 ${error.message}`;});
      choose(Object.hasOwn(records,pointKind)?pointKind:'optimum');
      await draw();
      if(!live()){Plotly.purge(graph);return;}
      const stopObserving=observe(Plotly,graph);
      metric.onchange=redraw;
      disposePlot=()=>{metric.onchange=null;stopObserving();};
      referenceButton.onclick=()=>{choose('reference');redraw();};
      optimumButton.onclick=()=>{choose('optimum');redraw();};
      if(nearby)nearby.onclick=()=>{choose('direct');redraw();};
      graph.on('plotly_click',e=>{
        if(!live())return;
        const record=e.points?.find(p=>Object.hasOwn(records,p.customdata))?.customdata;
        if(record){choose(record);redraw();return;}
        const atX=e.xvals?.[0]??e.points?.[0]?.x, atY=e.yvals?.[0]??e.points?.[0]?.y;
        if(!Number.isFinite(atX)||!Number.isFinite(atY))return;
        const i=nearestGridIndex(x,atX),j=nearestGridIndex(y,atY),n=j*x.length+i;
        const point=Object.fromEntries(Object.entries(grid.metrics).map(([key,values])=>[key,values[n]]));
        showPoint({...point,Te_volume_keV:x[i],ne_volume_m3:grid.ne_m3[j]},`网格节点 ${j+1}, ${i+1}`,grid.passed[n],'grid');
        redraw();
      });
    }catch(error){if(live())info.textContent=`网格不可用。 ${error.message}`;}
  }
  mesh.onchange=drawMesh;
  await drawMesh();
}

