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
          state.rebirth=3;autoPurchaseEligibleSlots();
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
        assert 'Collect the result and clear the table' in page.locator('.optimise-steps').inner_text()
        # An already occupied table needs just its missing third input.
        page.evaluate('''() => {
          localStorage.removeItem('droid-archive-optimise-sell-instead');
          const {state,optimisePage,autoPurchaseEligibleSlots}=testApp;
          state.rebirth=3;autoPurchaseEligibleSlots();
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
        assert not errors, errors
        browser.close()
        print('Browser checks passed: batches, labels, stack counts, Sell, classic plan, existing table inputs.')
finally:
    server.shutdown()
