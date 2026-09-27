import { pools } from './demo-data.js';
import { shareMotto } from './share-copy.mjs';

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

export function createDemoShare({ project, locale = 'zh', mottoIndex = 0 } = {}) {
  if (!project || demoProjects.get(project.id) !== project.name) return null;
  const url = buildDemoShareUrl(project.id);
  if (!url) return null;
  const english = locale === 'en';
  const title = `${project.name} #${project.id}`;
  const remaining = project.status === 'Funding' && Number.isInteger(project.funded)
    && project.funded >= 0 && project.funded <= 100 ? 100 - project.funded : null;
  const canSubscribe = remaining !== null && remaining > 0;
  const motto = shareMotto(locale, mottoIndex, canSubscribe);
  const text = english
    ? `[Demo] Explore ${title} on BEMine with me.\n${motto}\nSample data. No real transaction.`
    : `【演示预览】和我一起了解拼矿 BEMine · ${title}。\n${motto}\n样例数据，未发生真实交易。`;
  const xText = english
    ? `[Demo] BEMine · ${title}\n${motto}\nSample data. No real transaction.`
    : `【演示】BEMine · ${title}\n${motto}\n样例数据，未发生真实交易。`;
  const intent = (endpoint, source, intentText = text) => {
    const target = new URL(endpoint);
    target.searchParams.set('url', buildDemoShareUrl(project.id, source));
    target.searchParams.set('text', intentText);
    return target.href;
  };
  return {
    demo: true, title, text, xText, motto, url, copyText: `${text}\n${url}`, remaining, canSubscribe,
    telegramUrl: intent('https://t.me/share/url', 'tg'),
    xUrl: intent('https://x.com/intent/tweet', 'x', xText),
  };
}
