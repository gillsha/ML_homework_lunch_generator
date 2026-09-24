// Export native session objects locally; full transcripts are excluded from Git.
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const mainSession = process.argv[2];
if (!mainSession?.startsWith("ses_")) throw new Error("Usage: node tools/export-session.mjs <main-session-id>");
const generation = JSON.parse(await fs.readFile(new URL("generated/manifest.json", root), "utf8"));
for (const [id, name] of [[generation.session_id, "generation_session.json"], [mainSession, "elatontseva_a02_session.json"]]) {
    // A regular-file stdout descriptor avoids CLI pipe-buffer truncation on exit.
    const temporary = new URL(`${name}.export.tmp`, root);
    const handle = await fs.open(temporary, "w");
    try {
        execFileSync("opencode", ["export", id], { cwd: root, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", handle.fd, "pipe"] });
    } finally { await handle.close(); }
    const bytes = await fs.readFile(temporary);
    let session;
    try { session = JSON.parse(bytes); } catch { throw new Error(`Invalid native JSON export for ${id} (${bytes.length} bytes).`); }
    assert.equal(session.info.id, id);
    assert.ok(Array.isArray(session.messages) && session.messages.length > 0);
    await fs.rename(temporary, new URL(name, root));
    const roles = {};
    for (const message of session.messages) {
        const role = message.info.role;
        roles[role] = (roles[role] || 0) + 1;
    }
    console.log(JSON.stringify({ file: name, session_id: id, title: session.info.title, messages: session.messages.length, roles, bytes: bytes.length }));
}
