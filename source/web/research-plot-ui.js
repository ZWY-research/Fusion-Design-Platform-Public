const palette = [[30,36,68],[58,76,145],[56,153,163],[148,202,139],[255,228,139]];
const config = {responsive:true, displaylogo:false, scrollZoom:false};
export const theme = {paper_bgcolor:'transparent',plot_bgcolor:'#111d28',font:{color:'#b7cbd9',size:11},
  margin:{l:63,r:62,t:18,b:72},clickmode:'event',hovermode:'closest'};
export const axis = title => ({title:{text:title},gridcolor:'#304353',zerolinecolor:'#496274'});
export const fmt = (v, precision=6) => Number.isFinite(v)?Number(v.toPrecision(precision)).toString():'未提供';
export const quantity = (label,unit,scale=1) => ({label,unit,scale,colors:palette});
export function plot(text, id, label, parent) {
  const el = text('div','',parent);
  el.id=id; el.className='science-plot'; el.setAttribute('aria-label',label);
  return el;
}

export function menu(text, parent, id, label, choices) {
  const wrapper=text('label',label,parent), select=text('select','',wrapper);
  select.id=id;
  for (const [value,name] of choices) select.add(new Option(name,value));
  return select;
}

export function details(text,title,paragraphs,parent) {
  const el=text('details','',parent);
  text('summary',title,el);
  for(const p of paragraphs) text('p',p,el);
  return el;
}

export function provenance(text,sources,parent) {
  details(text,'源文件与 SHA-256',sources.map(({path,sha256})=>`${path} · ${sha256}`),parent);
}

export function table(text,columns,rows,parent) {
  const wrap=text('div','',parent), el=text('table','',wrap);
  wrap.className='table-scroll research-table';
  const header=text('tr','',text('thead','',el));
  for(const label of columns) text('th',label,header).scope='col';
  const body=text('tbody','',el);
  for(const values of rows) {
    const row=text('tr','',body);
    for(const value of values) text('td',value,row);
  }
  return el;
}

export function nearestGridIndex(sorted, coordinate) {
  let lo=0, hi=sorted.length-1;
  while(lo<hi){
    const mid=(lo+hi)>>>1;
    if(coordinate>sorted[mid]) lo=mid+1;
    else hi=mid;
  }
  return lo>0&&coordinate-sorted[lo-1]<=sorted[lo]-coordinate?lo-1:lo;
}

export function edges(grid) {
  const step=(grid.at(-1)-grid[0])/(grid.length-1);
  return Array.from({length:grid.length+1},(_,i)=>grid[0]+(i-.5)*step);
}

export function rasterOptions(raster,q,x,y) {
  const {min,max,url,colorscale}=raster;
  return {
    image:{source:url,xref:'x',yref:'y',x:x[0],y:y.at(-1),sizex:x.at(-1)-x[0],sizey:y.at(-1)-y[0],
      sizing:'stretch',xanchor:'left',yanchor:'top',layer:'below'},
    colorbar:{type:'scatter',mode:'markers',x:[x[0],x[0]],y:[y[0],y[0]],hoverinfo:'skip',showlegend:false,
      marker:{size:0,color:[min,max],cmin:min,cmax:max,colorscale,showscale:true,
        colorbar:{title:{text:q.unit},thickness:10,len:.8}}},
  };
}

export const marker = (x,y,name,color,symbol) => ({x:[x],y:[y],name,type:'scatter',mode:'markers',
  marker:{color,symbol,size:12,line:{color:'#111d28',width:1}},hovertemplate:'%{fullData.name}<extra></extra>'});
const line = (x,y,name,color) => ({x,y,name,type:'scatter',mode:'lines+markers',marker:{size:3},line:{color,width:1.6}});
export function splitPath(Plotly,host,traces,x,y,extra={}) {
  return Plotly.react(host,traces,{...theme,xaxis:axis(x),yaxis:axis(y),
    legend:{orientation:'h',y:-.20},width:host.clientWidth||undefined,...extra},config);
}

