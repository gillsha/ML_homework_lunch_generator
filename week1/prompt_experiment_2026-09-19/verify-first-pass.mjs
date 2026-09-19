import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Archive adapter: the test scenarios below are unchanged from the first run.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'rerun');
mkdirSync(output, { recursive: true });
const url = pathToFileURL(join(root, 'week1', 'index.html')).href;
const expected = [
    ['Pizza', 'pizza-slice'], ['Sushi', 'fish'], ['Burger', 'hamburger'],
    ['Salad', 'leaf'], ['Tacos', 'hotdog'], ['Ramen', 'bowl-food'],
    ['Sandwich', 'bread-slice'], ['Pasta', 'plate-wheat'], ['Curry', 'mortar-pestle'],
    ['Steak', 'bacon'], ['Soup', 'bowl-food'], ['BBQ', 'fire'],
];
const metadataUrl = 'https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.4.0/metadata/icons.json';
const response = await fetch(metadataUrl);
assert(response.ok);
const metadata = await response.json();
const definition = name => metadata[name] || Object.values(metadata).find(icon => icon.aliases?.names?.includes(name));
for (const [, icon] of expected) assert(definition(icon)?.free.includes('solid'), `${icon}: Free solid 6.4.0`);

const browser = await chromium.launch({ headless: true });
const report = { url, browser: browser.version(), metadataUrl, resources: [], errors: [], failedRequests: [], checks: [] };
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    function monitor(target) {
        target.on('pageerror', error => report.errors.push(error.message));
        target.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
        target.on('requestfailed', request => report.failedRequests.push({ url: request.url(), failure: request.failure() }));
        target.on('response', resource => {
            if (resource.url().includes('cdnjs.cloudflare.com')) report.resources.push({ url: resource.url(), status: resource.status() });
        });
    }
    monitor(page);
    await page.addInitScript(() => {
        window.__audit = { target: 4, draws: [], changes: [], animations: [] };
        Math.random = () => {
            window.__audit.draws.push({ at: performance.now(), index: window.__audit.target });
            return (window.__audit.target + 0.1) / 12;
        };
        document.addEventListener('DOMContentLoaded', () => {
            const name = document.getElementById('lunchName');
            new MutationObserver(() => window.__audit.changes.push({
                at: performance.now(), text: name.textContent, disabled: document.getElementById('generateBtn').disabled,
            })).observe(name, { childList: true });
            document.getElementById('result').addEventListener('animationstart', event => {
                if (event.animationName === 'fadeIn') window.__audit.animations.push({ at: performance.now(), name: name.textContent });
            });
        });
    });
    const button = page.locator('#generateBtn');
    const snapshot = () => page.evaluate(() => {
        const icon = document.getElementById('lunchIcon');
        const result = document.getElementById('result');
        const button = document.getElementById('generateBtn');
        return {
            name: document.getElementById('lunchName').textContent,
            icon: icon.className,
            content: getComputedStyle(icon, '::before').content,
            font: getComputedStyle(icon).fontFamily,
            fontReady: document.fonts.check('900 52px "Font Awesome 6 Free"'),
            iconWidth: icon.getBoundingClientRect().width,
            iconHeight: icon.getBoundingClientRect().height,
            disabled: button.disabled,
            buttonStyle: {
                opacity: getComputedStyle(button).opacity,
                cursor: getComputedStyle(button).cursor,
                transform: getComputedStyle(button).transform,
                shadow: getComputedStyle(button).boxShadow,
                background: getComputedStyle(button).backgroundColor,
            },
            fadeClass: result.classList.contains('fade-in'),
            opacity: getComputedStyle(result).opacity,
            animations: result.getAnimations().filter(animation => animation.animationName === 'fadeIn').map(animation => ({
                startTime: animation.startTime,
                currentTime: animation.currentTime,
                duration: animation.effect.getTiming().duration,
                fill: animation.effect.getTiming().fill,
                keyframes: animation.effect.getKeyframes().map(frame => ({ opacity: frame.opacity, transform: frame.transform })),
                playState: animation.playState,
            })),
            drawCount: window.__audit.draws.length,
            changes: [...window.__audit.changes],
            starts: [...window.__audit.animations],
        };
    });
    const setTarget = index => page.evaluate(index => { window.__audit.target = index; }, index);
    const settleFrames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    async function waitForResult() {
        await page.waitForFunction(() => !document.getElementById('generateBtn').disabled);
        await settleFrames();
        return snapshot();
    }
    function checkIcon(state, index) {
        const [name, icon] = expected[index];
        assert.equal(state.name, name);
        assert.equal(state.icon, `fas fa-${icon}`);
        assert(state.content.includes(String.fromCodePoint(parseInt(definition(icon).unicode, 16))));
        assert(state.font.includes('Font Awesome 6 Free'));
        assert(state.fontReady && state.iconWidth > 0 && state.iconHeight > 0);
    }
    function checkFreshAnimation(state) {
        assert.equal(state.animations.length, 1);
        const animation = state.animations[0];
        assert.equal(animation.duration, 500);
        assert.equal(animation.fill, 'forwards');
        assert.equal(animation.playState, 'running');
        assert(animation.currentTime < 200, 'Each displayed result must start a new animation');
        assert.deepEqual(animation.keyframes.map(frame => frame.opacity), ['0', '1']);
        assert.deepEqual(animation.keyframes.map(frame => frame.transform), ['translateY(10px)', 'translateY(0px)']);
        assert.equal(state.disabled, false, 'Button must unlock before animation ends');
    }
    async function checkAnimationComplete() {
        await page.waitForFunction(() => {
            const animation = document.getElementById('result').getAnimations().find(item => item.animationName === 'fadeIn');
            return animation?.playState === 'finished';
        });
        const state = await snapshot();
        assert.equal(state.opacity, '1');
        assert.equal(state.disabled, false);
    }
    async function generate(index, activation = 'mouse', finishAnimation = true) {
        const previous = await snapshot();
        await setTarget(index);
        if (activation === 'mouse') await button.click();
        else { await button.focus(); await page.keyboard.press(activation); }
        const loading = await snapshot();
        assert(loading.disabled);
        assert.equal(loading.name, 'Thinking...');
        assert.equal(loading.icon, 'fas fa-spinner fa-spin');
        assert.equal(loading.fadeClass, false);
        assert.equal(loading.animations.length, 0);
        assert.equal(loading.drawCount, previous.drawCount + 1);
        const state = await waitForResult();
        checkIcon(state, index);
        checkFreshAnimation(state);
        assert.equal(state.starts.length, previous.starts.length + 1);
        if (previous.animations.length) assert(state.animations[0].startTime > previous.animations[0].startTime);
        if (finishAnimation) await checkAnimationComplete();
        return { name: state.name, icon: state.icon, glyph: state.content, animationStart: state.animations[0].startTime };
    }

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const initial = await snapshot();
    assert.equal(initial.name, 'Thinking...');
    assert(initial.disabled);
    assert.equal(initial.drawCount, 1);
    const bounds = await button.boundingBox();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.evaluate(() => new Promise(resolve => {
        const button = document.getElementById('generateBtn');
        setTimeout(() => button.click(), 100);
        setTimeout(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); resolve(); }, 200);
    }));
    await page.keyboard.press('Enter');
    const firstResult = await waitForResult();
    checkFreshAnimation(firstResult);
    assert.equal(firstResult.drawCount, 1);
    await page.evaluate(() => document.fonts.ready);
    checkIcon(await snapshot(), 4);
    await checkAnimationComplete();
    await page.waitForTimeout(250);
    const afterInitial = await snapshot();
    assert.equal(afterInitial.changes.filter(change => change.text !== 'Thinking...').length, 1);
    report.checks.push({ test: 'Automatic selection, disabled button, ignored startup clicks, first fade', passed: true });

    const allDishes = [];
    for (let index = 0; index < expected.length; index++) allDishes.push(await generate(index));
    report.checks.push({ test: 'All 12 dishes: exact names/classes, loaded Free glyphs, complete fresh animations', passed: true, dishes: allDishes });

    const beforeBurst = await snapshot();
    await setTarget(0);
    await button.click();
    const acceptedAt = await page.evaluate(() => window.__audit.draws.at(-1).at);
    await setTarget(1);
    for (const offset of [100, 200]) {
        await page.evaluate(({ acceptedAt, offset }) => new Promise(resolve => setTimeout(resolve, Math.max(0, acceptedAt + offset - performance.now()))), { acceptedAt, offset });
        const box = await button.boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.keyboard.press(offset === 100 ? 'Enter' : 'Space');
        await page.evaluate(() => document.getElementById('generateBtn').dispatchEvent(new MouseEvent('click', { bubbles: true })));
        const waiting = await snapshot();
        assert(waiting.disabled);
        assert.equal(waiting.name, 'Thinking...');
        assert.equal(waiting.drawCount, beforeBurst.drawCount + 1);
    }
    await waitForResult();
    await page.waitForTimeout(750);
    const afterBurst = await snapshot();
    checkIcon(afterBurst, 0);
    assert.equal(afterBurst.drawCount, beforeBurst.drawCount + 1);
    const burstResults = afterBurst.changes.slice(beforeBurst.changes.length).filter(change => change.text !== 'Thinking...');
    assert.equal(burstResults.length, 1);
    assert.equal(afterBurst.starts.length, beforeBurst.starts.length + 1);
    const resultDelay = burstResults[0].at - acceptedAt;
    assert(resultDelay >= 480 && resultDelay < 1000);
    report.checks.push({ test: 'Rapid mouse/keyboard/synthetic clicks at 100 and 200 ms ignored', passed: true, result: afterBurst.name, resultDelayMs: Math.round(resultDelay), subsequentChanges: 0 });

    const repeatA = await generate(4);
    const repeatB = await generate(4);
    assert.equal(repeatA.name, repeatB.name);
    assert(repeatB.animationStart > repeatA.animationStart);
    report.checks.push({ test: 'Repeated identical dish: new generation and new animation each time', passed: true, result: repeatB.name });

    const interrupted = await generate(9, 'mouse', false);
    const following = await generate(7);
    assert(following.animationStart > interrupted.animationStart);
    report.checks.push({ test: 'New click interrupts the previous fade; next generation animates correctly', passed: true });

    await generate(10, 'Enter');
    await generate(11, 'Space');
    report.checks.push({ test: 'Enabled button works with Enter and Space', passed: true });

    await page.mouse.move(0, 0);
    await button.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(170);
    const disabledNoHover = await snapshot();
    const box = await button.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(180);
    const disabledHover = await snapshot();
    assert(disabledHover.disabled);
    assert(Number(disabledHover.buttonStyle.opacity) > 0 && Number(disabledHover.buttonStyle.opacity) < 1);
    assert.equal(disabledHover.buttonStyle.cursor, 'wait');
    assert.equal(disabledHover.buttonStyle.transform, 'none');
    assert.equal(disabledHover.buttonStyle.shadow, 'none');
    assert.deepEqual(disabledNoHover.buttonStyle, disabledHover.buttonStyle);
    report.checks.push({ test: 'Disabled state visibly dimmed; hover does not change its styles', passed: true });
    await waitForResult();
    await checkAnimationComplete();

    const layout = [];
    for (const width of [320, 375, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, card: document.querySelector('.card').getBoundingClientRect().width }));
        assert.equal(dimensions.document, width);
        assert(dimensions.card <= 500);
        layout.push(dimensions);
    }
    await generate(4);
    await page.screenshot({ path: join(output, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 900 });
    await generate(9);
    await page.screenshot({ path: join(output, 'mobile.png'), fullPage: true });
    report.checks.push({ test: 'No horizontal overflow at 320, 375 and 1280 px; card at most 500 px', passed: true, layout });

    const plainPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    monitor(plainPage);
    await plainPage.goto(url);
    const unmodifiedRandom = await plainPage.evaluate(() => Math.random.toString().includes('[native code]'));
    assert(unmodifiedRandom);
    const naturalResults = [];
    for (let index = 0; index < 3; index++) {
        if (index > 0) await plainPage.locator('#generateBtn').click();
        await plainPage.waitForFunction(() => !document.getElementById('generateBtn').disabled);
        const name = await plainPage.locator('#lunchName').textContent();
        assert(expected.some(([expectedName]) => expectedName === name));
        naturalResults.push(name);
    }
    report.checks.push({ test: 'Separate page with native Math.random: automatic and two manual choices', passed: true, naturalResults });

    assert.equal(report.errors.length, 0);
    assert.equal(report.failedRequests.length, 0);
    assert(report.resources.some(item => item.url.endsWith('/all.min.css') && item.status === 200));
    assert(report.resources.some(item => item.url.endsWith('/fa-solid-900.woff2') && item.status === 200));
    report.checks.push({ test: 'No JavaScript/console errors or failed resource requests', passed: true });
    writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
} finally {
    await browser.close();
}
