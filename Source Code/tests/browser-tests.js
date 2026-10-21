/* ============================================================================
   Browser tests - run inside the real page: index.html?test&data=tests/fixtures/
   (tests/run-tests.ps1 opens it in headless Edge/Chrome and reads the console).
   Each result is one console line: "TEST PASS <name>" or "TEST FAIL <name>: <reason>", then "TESTS DONE <passed>/<total>".
   The page's own scripts share one global scope, so the tests call their functions directly.
   ========================================================================== */
'use strict';

(async function runTests() {
  const results = [];
  const errors = [];
  window.addEventListener('error', e => errors.push(e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno));

  function check(name, ok, detail) {
    results.push(ok);
    console.log((ok ? 'TEST PASS ' : 'TEST FAIL ') + name + (ok || detail === undefined ? '' : ': ' + detail));
  }
  function equal(name, actual, expected) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    check(name, a === e, 'expected ' + e + ', got ' + a);
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(cond, ms = 6000) {
    for (let t = 0; t < ms; t += 50) {
      if (cond()) return true;
      await sleep(50);
    }
    return false;
  }

  /* ---------------------------------------------------------------- pure functions */

  // scenes/board.js - hardware names -> chip labels
  equal('hwNames: Intel', pick(hwNames({ cpu: '12th Gen Intel(R) Core(TM) i7-12650H', gpu: 'NVIDIA GeForce RTX 2050', vram: 4, ram: 'DDR4 SODIMM' })),
    { cpuChip: 'CORE i7', cpuName: 'CORE i7-12650H', gpuChip: 'RTX 2050', vram: '4 GB' });
  equal('hwNames: AMD', pick(hwNames({ cpu: 'AMD Ryzen 7 5800H with Radeon Graphics', gpu: 'AMD Radeon(TM) Graphics' })),
    { cpuChip: 'RYZEN 7', cpuName: 'RYZEN 7 5800H', gpuChip: 'RADEON', vram: '' });
  equal('hwNames: Intel Ultra + Arc', pick(hwNames({ cpu: 'Intel(R) Core(TM) Ultra 7 155H', gpu: 'Intel(R) Arc(TM) Graphics' })),
    { cpuChip: 'CORE ULTRA 7', cpuName: 'CORE ULTRA 7-155H', gpuChip: 'ARC', vram: '' });
  equal('hwNames: nothing known', pick(hwNames(null)), { cpuChip: 'CPU', cpuName: 'CPU', gpuChip: 'GPU', vram: '' });
  function pick(n) { return { cpuChip: n.cpuChip, cpuName: n.cpuName, gpuChip: n.gpuChip, vram: n.vram }; }

  // scenes/repos.js - language groups and the GitHub username rule
  equal('langGroup', ['TypeScript', 'C#', 'Jupyter Notebook', 'Markdown', 'Kotlin', null].map(langGroup),
    ['Web', 'C/C++', 'Python', 'Docs', 'Other', 'Other']);
  equal('GitHub username rule', ['octocat', 'a-b', '-x', 'x-', 'a--b', 'a b', 'x'.repeat(40)].map(u => GH_NAME.test(u)),
    [true, true, false, false, false, false, false]);

  // scenes/code.js - comments inside strings are not comments; user snippets
  equal('commentAt ignores strings', [commentAt('url = "http://x" // note', '//'), commentAt("s = '#'  # real", '#'), commentAt('no comment', '//')],
    [17, 9, -1]);
  const before = SNIPPETS.length;
  addSnippets([{ file: 'demo.go', code: '\n\tfmt.Println("hi")\n\n' }, { file: 'bad' }, { file: 'q.sql', code: ['SELECT 1;'] }]);
  const added = SNIPPETS.slice(before);
  equal('addSnippets: valid ones, comment + badge from extension',
    added.map(s => [s.file, s.cmt, s.badge, s.code]),
    [['demo.go', '//', 'go', ['    fmt.Println("hi")']], ['q.sql', '--', 'sql', ['SELECT 1;']]]);
  SNIPPETS.length = before;
  let drawOk = true;
  try {
    const c = makeCanvas(PANEL_W, PANEL_H);
    SNIPPETS.forEach(s => { drawPanel(s, c); drawPanel(s, c, 10, true); drawPanel(s, c, 0, true); });
  } catch (e) { drawOk = e.message; }
  check('drawPanel: every snippet, fully and partly typed', drawOk === true, drawOk);
  check('built-in snippets fit the window (<= 18 lines)', SNIPPETS.every(s => s.code.length <= 18));

  /* ---------------------------------------------------------------- data from the helper (tests/fixtures) */

  const loaded = await waitFor(() => LOAD.x && LOAD.hw && window.REPOS_OWNER);
  check('fixtures loaded (load.js, repos.js)', loaded);
  equal('load.js: GPU unknown, no battery, hardware names', [LOAD.gpuNA, LOAD.hw && LOAD.hw.cpu], [true, 'AMD Ryzen 7 5800H with Radeon Graphics']);
  updateLoad(0.1, 1);
  equal('updateLoad: desktop has no battery', LOAD.hasBat, false);
  const src = reposSource();
  equal('reposSource: helper data wins', [src.owner, src.list.length, src.demo], ['octocat', 3, false]);

  // Lively's own numbers: all-zero samples (broken counters) must be ignored
  const savedFileT = LOAD.fileT, savedLast = LOAD.lastLive;
  LOAD.fileT = 0;
  window.livelySystemInformation(JSON.stringify({ CurrentCpu: 0, CurrentGpu3D: 0 }));
  check('Lively zeros are ignored', LOAD.lastLive === savedLast);
  window.livelySystemInformation(JSON.stringify({ CurrentCpu: 35, CurrentGpu3D: 0 }));
  check('Lively real numbers are used', LOAD.lastLive !== savedLast && Math.abs(LOAD.tcpu - 0.35) < 1e-9);
  LOAD.fileT = savedFileT;

  /* ---------------------------------------------------------------- GitHub: stop after 3 refusals */

  {
    const realFetch = window.fetch, savedUser = ghUser;
    let calls = 0;
    window.fetch = () => { calls++; return Promise.resolve({ ok: false, status: 404 }); };
    try { localStorage.removeItem('cswRepos:nobody-zz9'); } catch (e) {}
    ghUser = 'nobody-zz9'; ghRejected = 0;
    for (let i = 0; i < 5; i++) { fetchGithubRepos(); await sleep(20); }
    equal('GitHub asked at most 3 times after refusals', calls, 3);
    window.fetch = realFetch; ghUser = savedUser; ghRejected = 0;
  }

  /* ---------------------------------------------------------------- widgets */

  dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
  await waitFor(() => document.getElementById('mArt').classList.contains('has'), 3000);
  equal('widgets: music, battery, disk',
    [document.getElementById('mTitle').textContent, document.getElementById('vBat').textContent,
     document.getElementById('dCap').textContent, document.getElementById('eRam').textContent],
    ['Test Song', 'AC', '45.2 GB free on D:', 'RAM · 16 GB']);
  check('widgets: cover loaded from cover.js', document.getElementById('mArt').classList.contains('has'));

  /* ---------------------------------------------------------------- scenes, themes, quality */

  let sceneErr = '';
  const texAt = [];   // GPU texture count after each scene was shown
  for (const i of [0, 1, 2, 0]) {
    try {
      enter(i);
      for (let k = 0; k < 90; k++) current.update(k / 30, 1 / 30);   // 3 seconds of animation
      composer.render(1 / 30);
    } catch (e) { sceneErr += 'scene ' + i + ': ' + e.message + ' '; }
    texAt.push(renderer.info.memory.textures);
  }
  const tex0 = texAt[0];
  check('every scene builds, animates and renders', !sceneErr, sceneErr);
  check('leaving a scene frees its textures (Board -> Repos -> Code -> Board)', texAt[3] <= tex0 + 2, texAt.join(' -> '));
  check('widgets close outside the Board scene', await (async () => {
    enter(2); await sleep(400); const open = document.getElementById('wg').classList.contains('open'); enter(0); return !open;
  })());

  equal('themes: five, including Graphite', PKEYS, ['ice', 'amber', 'jade', 'violet', 'graphite']);
  setPalette('graphite');
  equal('theme Graphite applies its accent', getComputedStyle(document.documentElement).getPropertyValue('--acc').trim(), '#b4b9c2');
  setPalette('ice');

  PERF.q = 3; applyPerf();
  equal('quality LOW: no bloom, no MSAA', [bloom.enabled, composer.renderTarget1.samples], [false, 0]);
  PERF.q = 1; applyPerf();
  equal('quality HIGH: bloom + 4x MSAA', [bloom.enabled, composer.renderTarget1.samples], [true, 4]);

  /* ---------------------------------------------------------------- done */

  check('no uncaught page errors', errors.length === 0, errors.join(' | '));
  const passed = results.filter(Boolean).length;
  console.log('TESTS DONE ' + passed + '/' + results.length);
  document.title = 'TESTS ' + passed + '/' + results.length;
})();
