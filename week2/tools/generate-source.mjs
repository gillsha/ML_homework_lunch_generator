// Reproduce the clean-room prompt experiment without exposing the maintained app.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
if (process.argv.includes("--background")) {
    const log = openSync(path.join(root, "generation.log"), "a");
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
        cwd: root, detached: true, stdio: ["ignore", log, log],
    });
    child.unref();
    console.log(`Generation job started (PID ${child.pid}); progress: generation.log and generated/manifest.json`);
} else {
    const tempRoot = process.env.TMPDIR || "/tmp";
    const staging = await fs.mkdtemp(path.join(tempRoot, "movie-prompt-"));
    const output = path.join(staging, "app");
    const destination = path.join(root, "generated");
    await fs.mkdir(output);
    await fs.mkdir(destination, { recursive: true });
    const inputs = {};
    for (const name of ["u.item", "u.data"]) {
        const bytes = await fs.readFile(path.join(root, name));
        await fs.writeFile(path.join(staging, name), bytes);
        inputs[name] = hash(bytes);
    }
    const prompt = await fs.readFile(path.join(root, "readme.md"));
    await fs.writeFile(path.join(output, "PROMPT.md"), prompt);
    const manifest = {
        status: "running", model: "openai/gpt-6-astra", started_at: new Date().toISOString(),
        prompt_sha256: hash(prompt), inputs_sha256: inputs,
        method: "Fresh OpenCode session in an isolated temporary directory; prompt and raw datasets only.",
        manual_source_edits: false,
    };
    const manifestPath = path.join(destination, "manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`Isolated workspace: ${staging}`);
    const args = ["run", "--pure", "--dir", output, "--model", manifest.model,
        "--title", "Movie recommender clean-room generation", "--format", "json",
        "Read PROMPT.md and create the five requested application files in this directory. Only PROMPT.md and ../u.item and ../u.data are inputs. Do not inspect any existing application or repository. Do not delegate or use subagents. Use file-editing tools to implement the complete prompt. Do not change the prompt or datasets."];
    manifest.command = "opencode run --pure --dir <isolated-output> --model openai/gpt-6-astra --format json <generation instruction>";
    const logHandle = await fs.open(path.join(root, "generation-events.log"), "w");
    const child = spawn("opencode", args, {
        cwd: output,
        env: { ...process.env, OPENCODE_PERMISSION: JSON.stringify({ "*": "deny", read: "allow", glob: "allow", grep: "allow", edit: "allow", external_directory: "allow" }) },
        stdio: ["ignore", "pipe", "pipe"],
    });
    let events = "";
    child.stdout.on("data", chunk => { events += chunk; logHandle.write(chunk); });
    child.stderr.on("data", chunk => process.stderr.write(chunk));
    const timeout = setTimeout(() => child.kill("SIGTERM"), 20 * 60 * 1000);
    const code = await new Promise((resolve, reject) => { child.on("close", resolve); child.on("error", reject); });
    clearTimeout(timeout);
    await logHandle.close();
    manifest.exit_code = code;
    manifest.finished_at = new Date().toISOString();
    for (const line of events.split("\n")) {
        try { const event = JSON.parse(line); if (event.sessionID) manifest.session_id = event.sessionID; } catch {}
    }
    try {
        if (code !== 0) throw new Error(`Generation process exited with ${code}.`);
        manifest.files_sha256 = {};
        for (const name of ["index.html", "style.css", "data.js", "recommender.js", "script.js"]) {
            const bytes = await fs.readFile(path.join(output, name));
            if (!bytes.length) throw new Error(`Empty generated file: ${name}`);
            await fs.writeFile(path.join(destination, name), bytes);
            manifest.files_sha256[name] = hash(bytes);
        }
        manifest.status = "generated; acceptance checks pending";
    } catch (error) {
        manifest.status = "failed";
        manifest.error = error.message;
        process.exitCode = 1;
    }
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(JSON.stringify(manifest, null, 2));
}
