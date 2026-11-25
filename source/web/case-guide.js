export function mountCaseGuide({workspace, selectCase, prdCaseId, evidence = []}) {
  const notice = document.createElement('section');
  notice.id = 'research-diagnostic-gap';
  notice.className = 'results research-gap';
  notice.hidden = true;
  const title = document.createElement('h1');
  title.textContent = '汤姆逊散射诊断';
  const detail = document.createElement('p');
  const back = document.createElement('button');
  back.className = 'secondary';
  back.textContent = '打开 A3 完整诊断';
  back.onclick = () => selectCase(prdCaseId);
  notice.append(title, detail, back);
  workspace.append(notice);
  const chain=document.createElement('details');
  chain.id='research-ts-evidence';
  const summary=document.createElement('summary');
  summary.textContent='C1–C7 · TS 数值与合成验证';
  chain.append(summary);
  for(const value of evidence){
    const p=document.createElement('p');p.textContent=value;chain.append(p);
  }
  if (evidence.length) workspace.querySelector('.diagnostic-panel').append(chain);
  return current => {
    const gap = current.research?.diagnosticGap;
    workspace.toggleAttribute('data-diagnostic-gap', Boolean(gap));
    notice.hidden = !gap;
    detail.textContent = gap ? `${current.research.id} · ${current.research.label}。当前案例没有匹配的已计算 TS 结果。${gap}` : '';
  };
}
