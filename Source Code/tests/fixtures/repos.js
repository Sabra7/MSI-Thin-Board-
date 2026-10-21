// Test data in the format helper\repos-worker.ps1 writes to data\repos.js
window.REPOS_OWNER = 'octocat';
window.REPOS_DATA = [
  { name: 'hello-world', isPrivate: false, pushedAt: '2026-10-01T00:00:00Z', primaryLanguage: { name: 'Python' }, diskUsage: 120 },
  { name: 'secret-project', isPrivate: true, pushedAt: '2026-10-10T00:00:00Z' },
  { name: 'site', isPrivate: false, pushedAt: '2026-09-01T00:00:00Z', primaryLanguage: { name: 'TypeScript' } }
];
window.__csReposLoaded && window.__csReposLoaded();
