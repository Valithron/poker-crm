import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = ["src", "shared", "functions", "tests"];
const extensions = new Set([".ts", ".tsx"]);
const forbidden = [
  { pattern: /firebase/i, message: "Legacy Firebase reference" },
  { pattern: /gstatic\.com/i, message: "Remote runtime dependency" },
  { pattern: /console\.log\(/, message: "Debug console.log" },
  { pattern: /:\s*any\b/, message: "Explicit any type" },
];

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
    for (const rule of forbidden) {
      if (rule.pattern.test(source)) errors.push(`${file}: ${rule.message}`);
    }
  }
}

if (errors.length) {
  throw new Error(`Lint failed:\n${errors.join("\n")}`);
}

console.info("Source lint passed.");
