"""Browser regression test. Requires Python Playwright and Microsoft Edge."""
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

handler = functools.partial(QuietHandler, directory=str(ROOT))
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel='msedge')
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('console', lambda msg: print(msg.text) if msg.type=='warning' else None)
        page.on('pageerror', lambda error: errors.append(str(error)))
        # Expose module state only in this isolated test browser.
        code = (ROOT / 'app.js').read_text(encoding='utf-8') + '\nwindow.testApp={state,optimisePage,autoPurchaseEligibleSlots};'
        page.route('**/app.js*', lambda route: route.fulfill(body=code, content_type='text/javascript'))
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.wait_for_function('window.testApp?.state.droids.length > 0')
        if page.locator('#patchNotesClose').count():
            page.locator('#patchNotesClose').click()
        page.evaluate('''() => {
          const {state,optimisePage,autoPurchaseEligibleSlots}=testApp;
          state.rebirth=3;state.novaUpgrades['fusion-tank']=2;autoPurchaseEligibleSlots();
          state.optimiseKeepDroidex=false;state.optimiseFuseFirst=true;
          state.owned=[{name:'SNOW MOUSE',variant:'STELLAR',qty:15},
            {name:'SNOW MOUSE',variant:'DIAMOND',qty:6,preferred:'BUILD'}];
          optimisePage();
        }''')
        assert page.locator('[data-sell-instead]').count() == 6
        assert 'undefined' not in page.locator('.optimise-steps').inner_text().lower()
        assert page.locator('.fuse-first-list > li').count() == 2
        assert page.locator('.sell-card.to-fusion').count() == 6
        page.locator('.optimise-steps').screenshot(path=str(Path(__file__).with_name('fusion-batches.png')))
        # Click the real button and check both representations recalculate.
        page.locator('[data-sell-instead]').first.click()
        assert page.locator('[data-sell-instead]').count() == 3
        assert page.locator('.fuse-first-list > li').count() == 1
        assert page.locator('.sell-card.to-fusion').count() == 3
        page.locator('#toggleStepStyle').click()
        assert page.locator('[data-sell-instead]').count() == 3
        assert 'The result occupies Fusion Build slot' in page.locator('.optimise-steps').inner_text()
        # An already occupied table needs just its missing third input.
        page.evaluate('''() => {
          localStorage.removeItem('droid-archive-optimise-sell-instead');
          const {state,optimisePage,autoPurchaseEligibleSlots}=testApp;
          state.rebirth=3;state.novaUpgrades['fusion-tank']=2;autoPurchaseEligibleSlots();
          state.owned=[{name:'SNOW MOUSE',variant:'STELLAR',qty:15},
            {name:'SNOW MOUSE',variant:'DIAMOND',qty:1,preferred:'FUSION',preferredSlot:0},
            {name:'SNOW MOUSE',variant:'DIAMOND',qty:1,preferred:'FUSION',preferredSlot:1},
            {name:'SNOW MOUSE',variant:'DIAMOND',qty:1,preferred:'BUILD'}];
          optimisePage();
        }''')
        text = page.locator('.optimise-steps').inner_text()
        assert text.count('Leave SNOW MOUSE Diamond in Fusion for this batch.') == 2
        assert text.count('to the Fusion room instead of selling.') == 1
        assert page.locator('[data-sell-instead]').count() == 3
        # Reproduce two completed Fusion Builds, then two independent fusions.
        for style in ('route', 'classic'):
            page.evaluate("""style => {
              localStorage.setItem('droid-archive-optimise-step-style',style);
              const {state,optimisePage}=testApp;
              state.owned=[{name:'SNOW MOUSE',variant:'STELLAR',qty:13},
                {name:'SNOW MOUSE',variant:'STELLAR',qty:1,preferred:'FUSION_BUILD',preferredSlot:0,built:true},
                {name:'SNOW MOUSE',variant:'STELLAR',qty:1,preferred:'FUSION_BUILD',preferredSlot:1,built:true},
                {name:'SNOW MOUSE',variant:'DIAMOND',qty:6,preferred:'BUILD'}];
              optimisePage();
            }""", style)
            rows = page.locator('.optimise-steps .step-text').all_text_contents()
            fuses = [i for i, text in enumerate(rows) if text.startswith('Fuse ')]
            releases = [i for i, text in enumerate(rows) if 'free a Fusion Build slot before the next batch' in text]
            transfers = [i for i, text in enumerate(rows) if 'to the Fusion room instead of selling' in text]
            assert len(fuses) == 2, rows
            assert len(transfers) == 6, rows
            assert fuses[0] < releases[0] < transfers[3] < fuses[1], rows
            assert sum('go to work from Fusion Build' in text for text in rows) == 1, rows
        # New results have a build time: a single result slot cannot run two
        # independent batches without another Base update.
        page.evaluate("""() => {
          const {state,optimisePage}=testApp;
          state.novaUpgrades['fusion-tank']=0;
          state.owned=[{name:'SNOW MOUSE',variant:'STELLAR',qty:15},
            {name:'SNOW MOUSE',variant:'DIAMOND',qty:6,preferred:'BUILD'}];
          optimisePage();
        }""")
        rows = page.locator('.optimise-steps .step-text').all_text_contents()
        assert sum(text.startswith('Fuse ') for text in rows) == 1, rows
        assert sum('to the Fusion room instead of selling' in text for text in rows) == 3, rows
        assert any('Fusion Build is full (1/1)' in text for text in rows), rows
        assert page.locator('.sell-card').filter(has_text='Waiting for Fusion Build space').count() == 3
        before = page.evaluate('JSON.stringify(testApp.state.owned)')
        dialogs = []
        page.on('dialog', lambda dialog: (dialogs.append(dialog.message), dialog.dismiss()))
        page.locator('#applyOptimised').click()
        assert page.evaluate('JSON.stringify(testApp.state.owned)') == before
        assert not dialogs, dialogs
        assert 'Free a Fusion Build slot and run Optimise again before applying' in page.locator('body').inner_text()
        assert not errors, errors
        browser.close()
        print('Browser checks passed: batches, Sell, existing inputs, Fusion Build capacity in both plan styles, blocked Apply.')
finally:
    server.shutdown()
