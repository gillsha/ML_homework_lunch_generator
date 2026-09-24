import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { startServer } from "../tools/static-server.mjs";

const root = new URL("../", import.meta.url);
await fs.mkdir(new URL("experiments/", root), { recursive: true });
const server = await startServer();
const browser = await chromium.launch({ headless: true });
const results = [];
const prefixes = process.env.APP_PREFIXES?.split(",") || ["", "generated/"];
const readCards = (page, panel) => page.locator(`#${panel} [data-movie-id]`).evaluateAll(nodes => nodes.map(node => ({ id: Number(node.dataset.movieId), score: Number(node.dataset.score) })));
async function add(page, id) { await page.selectOption("#movie-select", String(id)); await page.click("#add-movie"); }
async function ready(page, prefix) {
    await page.goto(`${server.url}/${prefix}`);
    await page.waitForFunction(() => !document.getElementById("movie-select").disabled);
}
async function check(prefix, name, callback, options = {}) {
    if (process.env.CASE_FILTER && !name.includes(process.env.CASE_FILTER)) return;
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, ...options });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
        await callback(page);
        assert.deepEqual(errors, []);
        results.push({ implementation: prefix || "maintained", name, passed: true });
        console.log(`PASS ${prefix || "maintained"}: ${name}`);
    } catch (error) {
        results.push({ implementation: prefix || "maintained", name, passed: false, error: error.stack });
        console.error(`FAIL ${prefix || "maintained"}: ${name}: ${error.message}`);
    } finally { await context.close(); }
}

try {
    for (const prefix of prefixes) {
        await check(prefix, "catalogue, duplicate prevention, equality, history, active seed, rapid clicks", async page => {
            await ready(page, prefix);
            assert.equal(await page.locator("#movie-select option").count(), 1683);
            assert.match(await page.locator("#movie-select option[value='543']").textContent(), /Misérables/);
            await add(page, 1);
            await page.click("#add-movie");
            assert.equal(await page.locator("#history [data-movie-id]").count(), 1);
            assert.match(await page.locator("#status").textContent(), /already|duplicate/i);
            await page.click("#recommend-btn");
            const first = await readCards(page, "single-results");
            assert.equal(first.length, 5);
            assert.deepEqual(first, await readCards(page, "profile-results"));
            await add(page, 50);
            assert.equal((await readCards(page, "single-results")).length, 0);
            await add(page, 203);
            assert.ok(await page.locator("#add-movie").isDisabled());
            await page.check('input[name="active-movie"][value="203"]');
            await page.click("#recommend-btn");
            for (const panel of ["single-results", "profile-results"]) {
                const cards = await readCards(page, panel);
                assert.equal(cards.length, 5);
                assert.equal(new Set(cards.map(card => card.id)).size, 5);
                assert.ok(cards.every(card => card.score > 0 && ![1, 50, 203].includes(card.id)));
            }
            const stable = await readCards(page, "profile-results");
            await page.evaluate(() => { for (let i = 0; i < 30; i++) document.getElementById("recommend-btn").click(); });
            assert.deepEqual(await readCards(page, "profile-results"), stable);
            await page.screenshot({ path: new URL(`experiments/${prefix ? "generated" : "maintained"}-desktop.png`, root).pathname, fullPage: true });
            await page.click('[data-remove-id="203"]');
            assert.equal((await readCards(page, "profile-results")).length, 0);
            assert.ok(await page.locator('input[name="active-movie"][value="1"]').isChecked());
            assert.ok(await page.locator("#add-movie").isEnabled());
            await add(page, 267);
            await page.check('input[name="active-movie"][value="267"]');
            await page.click("#recommend-btn");
            assert.equal((await readCards(page, "single-results")).length, 0);
            assert.equal((await readCards(page, "profile-results")).length, 5);
        });
        await check(prefix, "unavailable ratings do not block recommendations", async page => {
            await page.route("**/u.data", route => route.fulfill({ status: 404, body: "Not found" }));
            await ready(page, prefix);
            await add(page, 203);
            await page.click("#recommend-btn");
            assert.equal((await readCards(page, "single-results")).length, 5);
            await page.waitForFunction(() => /unavailable/i.test(document.getElementById("metadata-status").textContent));
            assert.match(await page.locator("#single-results").textContent(), /unavailable/i);
        });
        await check(prefix, "delayed ratings, state color and selection error preservation", async page => {
            let release;
            const gate = new Promise(resolve => { release = resolve; });
            await page.route("**/u.data", async route => { await gate; await route.continue(); });
            try {
                await ready(page, prefix);
                await add(page, 1);
                await page.click("#recommend-btn");
                const before = await readCards(page, "profile-results");
                const successColor = await page.locator("#status").evaluate(node => getComputedStyle(node).color);
                await page.click("#add-movie");
                const errorMessage = await page.locator("#status").textContent();
                const errorColor = await page.locator("#status").evaluate(node => getComputedStyle(node).color);
                assert.notEqual(errorColor, successColor);
                release();
                await page.waitForFunction(() => /Rating(?:s| count):\s*\d/i.test(document.getElementById("single-results").textContent));
                assert.equal(await page.locator("#status").textContent(), errorMessage);
                assert.deepEqual(await readCards(page, "profile-results"), before);
            } finally { release(); }
        });
        await check(prefix, "missing catalogue gives error and disables controls", async page => {
            await page.route("**/u.item", route => route.fulfill({ status: 404, body: "Not found" }));
            await page.goto(`${server.url}/${prefix}`);
            await page.waitForFunction(() => /404/.test(document.getElementById("status").textContent));
            assert.ok(await page.locator("#movie-select").isDisabled());
            assert.ok(await page.locator("#recommend-btn").isDisabled());
        });
        await check(prefix, "empty/short results and untrusted titles rendered as text", async page => {
            const flags = Array(19).fill(0); flags[1] = 1;
            const rows = ["1|<img src=x onerror=alert(1)>|||", "2|Second|||"]
                .map(row => `${row}|${flags.join("|")}`).join("\n");
            await page.route("**/u.item", route => route.fulfill({ body: rows }));
            await page.route("**/u.data", route => route.fulfill({ body: "1\t1\t4\t1" }));
            await ready(page, prefix);
            await add(page, 2);
            await page.click("#recommend-btn");
            assert.equal((await readCards(page, "single-results")).length, 1);
            assert.equal(await page.locator("#single-results img").count(), 0);
            assert.match(await page.locator("#single-results").textContent(), /<img/);
            await add(page, 1);
            await page.click("#recommend-btn");
            assert.equal((await readCards(page, "single-results")).length, 0);
        });
        await check(prefix, "mobile layout and keyboard selection", async page => {
            await ready(page, prefix);
            await page.locator("#movie-select").focus();
            await page.selectOption("#movie-select", "1");
            await page.keyboard.press("Tab");
            assert.equal(await page.evaluate(() => document.activeElement.id), "add-movie");
            await page.keyboard.press("Enter");
            await page.click("#recommend-btn");
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: new URL(`experiments/${prefix ? "generated" : "maintained"}-mobile.png`, root).pathname, fullPage: true });
        }, { viewport: { width: 390, height: 844 } });
    }
} finally {
    const previous = await fs.readFile(new URL("experiments/browser-results.json", root), "utf8")
        .then(JSON.parse).catch(() => ({ cases: [] }));
    const cases = [...previous.cases.filter(row => !results.some(result => result.implementation === row.implementation && result.name === row.name)), ...results];
    const report = { browser: browser.version(), executed_at: new Date().toISOString(), cases };
    await fs.writeFile(new URL("experiments/browser-results.json", root), JSON.stringify(report, null, 2) + "\n");
    await browser.close();
    await server.close();
}
if (results.some(result => !result.passed)) process.exitCode = 1;
