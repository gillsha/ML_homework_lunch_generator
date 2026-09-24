import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function startServer() {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png" };
    const server = http.createServer(async (req, res) => {
        try {
            let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
            if (pathname.endsWith("/")) pathname += "index.html";
            const target = path.resolve(root, `.${pathname}`);
            if (!target.startsWith(root)) throw new Error("Outside root");
            const body = await fs.readFile(target);
            res.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
            res.end(body);
        } catch { res.writeHead(404); res.end("Not found"); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}
