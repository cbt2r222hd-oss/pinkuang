/** Stop a Vite page from requesting new wallet signatures after its inputs drift. */
export function guardJournalWrites(checkCurrent) {
  return (req, res, next) => {
    if (!req.url?.startsWith('/api/journal/') || !['POST', 'PUT', 'DELETE'].includes(req.method ?? '')) return next();
    try {
      checkCurrent();
      next();
    } catch {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ error: '合约源码或部署产物已更改，请运行 npm run artifacts 并重启部署页面。' }));
    }
  };
}
