import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = ["src", "shared", "functions", "tests", "scripts"];
const extensions = new Set([".ts", ".tsx", ".mjs"]);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (extensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const errors = [];
for (const root of roots) {
  for (const file of await collect(root)) {
    const source = await readFile(file, "utf8");
    if (!source.endsWith("\n")) errors.push(`${file}: missing final newline`);
    if (/[ \t]+$/m.test(source)) errors.push(`${file}: trailing whitespace`);
    if (source.includes("\r\n")) errors.push(`${file}: use LF line endings`);
  }
}

if (errors.length) throw new Error(`Format check failed:\n${errors.join("\n")}`);
console.info("Format check passed.");
