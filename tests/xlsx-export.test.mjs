import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = { addEventListener: () => {} };

const { createXlsxBlob, heatmapModel } = await import("../build/litreader.js");
const stamp = "2026-08-28T10:00:00.000Z";
const blob = createXlsxBlob([{ id: "1", title: "Cells & signals", authors: "A. Author", journal: "Test", year: "2026", doi: "10.1/test", url: "https://example.test", readDate: "2026-08-28", status: "Read", rating: 5, tags: ["methods"], keyPoints: "Useful < finding", methods: "", limitations: "", thinking: "", nextSteps: "", createdAt: stamp, updatedAt: stamp }]);
const dir = await mkdtemp(join(tmpdir(), "litreader-xlsx-"));
const file = join(dir, "test.xlsx");
await writeFile(file, Buffer.from(await blob.arrayBuffer()));
execFileSync("unzip", ["-t", file], { stdio: "ignore" });
const sheet = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet1.xml"], { encoding: "utf8" });
assert.match(sheet, /Cells &amp; signals/);
assert.match(sheet, /Useful &lt; finding/);
assert.match(sheet, /autoFilter ref="A1:Q2"/);

const entry = (readDate, id) => ({ id, title: `Paper ${id}`, authors: "", journal: "", year: "", doi: "", url: "", readDate, status: "Read", rating: 0, tags: [], keyPoints: "", methods: "", limitations: "", thinking: "", nextSteps: "", createdAt: stamp, updatedAt: stamp });
const heatmap = heatmapModel([
  entry("2026-08-28", "a"), entry("2026-08-28", "b"), entry("2026-08-27", "c"), entry("2026-08-26", "d")
], 16, new Date(2026, 7, 28, 12));
assert.equal(heatmap.days.length, 112);
assert.equal(heatmap.streak, 3);
assert.equal(heatmap.days.find(day => day.key === "2026-08-28").level, 2);
