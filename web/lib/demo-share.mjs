import { pools } from './demo-data.js';

// Deliberately separate from verified transaction sharing. Only known preview projects are supported.
export const DEMO_SHARE_BASE = 'https://tapeout.cc.cd/bemine/preview.html';
const demoProjects = new Map(pools.map(project => [project.id, project.name]));

export function buildDemoShareUrl(projectId, source) {
  if (typeof projectId !== 'string' || !demoProjects.has(projectId)
    || (source !== undefined && !['tg', 'x', 'native'].includes(source))) return null;
  const url = new URL(DEMO_SHARE_BASE);
  if (source) url.searchParams.set('source', source);
  url.hash = `detail/${projectId}`;
  return url.href;
}

export function createDemoShare({ project, locale = 'zh' } = {}) {
  if (!project || demoProjects.get(project.id) !== project.name) return null;
  const url = buildDemoShareUrl(project.id);
  if (!url) return null;
  const english = locale === 'en';
  const title = `${project.name} #${project.id}`;
  const text = english
    ? `[Demo] Explore ${title} on BEMine with me.\nCo-own BEM miners. Share the BEM journey.\nSample data. No real transaction.`
    : `【演示预览】和我一起了解拼矿 BEMine · ${title}。\n共持 BEM 矿机，共享 BEM 人生。\n样例数据，未发生真实交易。`;
  const remaining = project.status === 'Funding' && Number.isInteger(project.funded)
    && project.funded >= 0 && project.funded <= 100 ? 100 - project.funded : null;
  const intent = (endpoint, source) => {
    const target = new URL(endpoint);
    target.searchParams.set('url', buildDemoShareUrl(project.id, source));
    target.searchParams.set('text', text);
    return target.href;
  };
  return {
    demo: true, title, text, url, copyText: `${text}\n${url}`, remaining,
    telegramUrl: intent('https://t.me/share/url', 'tg'),
    xUrl: intent('https://x.com/intent/tweet', 'x'),
    native: { title: `BEMine · ${title}`, text, url: buildDemoShareUrl(project.id, 'native') },
  };
}
