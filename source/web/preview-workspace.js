import prdCase from './prd-case.json' with {type:'json'};
import references from './preview-cases.json' with {type:'json'};
import {mountCaseGuide as mountGuide} from './case-guide.js';
import {mountPopcon} from './popcon-view.js';

export const cases = [...references, {...prdCase, research:{
  id:'A3', label:'SPARCPublic PRD · 双零数字孪生',
  model:'CFS SPARCPublic · FreeGS 双零 · TRANSP / CGYRO',
}}];
export const data = null;
export const newTarget = () => structuredClone(prdCase);
export const isEditable = () => false;
export const mountTargetEditor = () => ({sync() {}});
export const mountDesignWorkspace = () => ({clearSelection() {}});
export const invalidate = () => {};
export const fuelApplicability = () => '';
export const researchCases = cases.map(({caseId,research})=>({caseId,...research}));
export const scanCase = c => c;
export const componentFacts = (_current, facts) => facts;
export const mountCaseGuide = params => mountGuide({...params, prdCaseId:prdCase.caseId, evidence:[
  '固定配置的 90 个位置各有 100 次有效合成反演记录。光谱、六通道信号、温密和误差均来自该配置的预计算快照。实验传输与标定尚待验证。',
  '激光、窗口与集光系统是独立研究设计。不同光学或激光配置及重新计算需要使用本地科研版。',
]});

async function loadPopcon(asset, caseId, signal) {
  const response = await fetch(`${import.meta.env.BASE_URL}popcon/${asset}.json`,{signal});
  if(!response.ok) throw Error(`预计算文件请求失败，HTTP ${response.status}`);
  const data = await response.json();
  if(data.schemaVersion!==1 || data.caseId!==caseId) throw Error('案例数据版本不匹配');
  return data;
}

export function mountResearchScience(ctx) {
  if(ctx.current.caseId===prdCase.caseId) return false;
  const request = new AbortController();
  ctx.onCleanup(()=>request.abort());
  mountPopcon(ctx,request.signal,loadPopcon,[[40,30],[100,100]]).catch(error=>{
    if(ctx.isActive()) ctx.text('p',`预计算展示不可用。 ${error.message}`).setAttribute('role','alert');
  });
  return true;
}
