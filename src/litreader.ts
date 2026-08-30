type ReadingStatus = "To read" | "Reading" | "Read" | "Revisit";

type ReadingEntry = {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
  doi: string;
  url: string;
  readDate: string;
  status: ReadingStatus;
  rating: number;
  tags: string[];
  keyPoints: string;
  methods: string;
  limitations: string;
  thinking: string;
  nextSteps: string;
  createdAt: string;
  updatedAt: string;
};

type Settings = {
  googleEndpoint: string;
  googleToken: string;
  zoteroUserId: string;
  zoteroApiKey: string;
};

type CrossrefDate = { "date-parts"?: Array<Array<number>> };
type CrossrefAuthor = { given?: string; family?: string; name?: string };
type CrossrefMessage = {
  DOI?: string;
  URL?: string;
  title?: string[];
  author?: CrossrefAuthor[];
  "container-title"?: string[];
  publisher?: string;
  subject?: string[];
  issued?: CrossrefDate;
  "published-print"?: CrossrefDate;
  "published-online"?: CrossrefDate;
  created?: CrossrefDate;
};
type DataCiteAttributes = {
  doi?: string;
  title?: string;
  titles?: Array<{ title?: string }>;
  creators?: Array<{ name?: string; givenName?: string; familyName?: string }>;
  container?: { title?: string };
  publisher?: string;
  publicationYear?: number | string;
  url?: string;
  subjects?: Array<{ subject?: string }>;
};
type ZoteroItemData = {
  DOI?: string;
  title?: string;
  creators?: Array<{ firstName?: string; lastName?: string; name?: string }>;
  publicationTitle?: string;
  bookTitle?: string;
  date?: string;
  url?: string;
  tags?: Array<{ tag?: string }>;
};

declare global {
  interface Window {
    webkit?: { messageHandlers?: { doiLookup?: { postMessage: (request: { id: string; doi: string }) => void } } };
    __litreaderDoiResult?: (result: NativeDoiResult) => void;
    __litreaderNativeOwnsDoiLookup?: boolean;
  }
}

const STORAGE_KEY = "litreader.entries.v1";
const SETTINGS_KEY = "litreader.settings.v1";

const qs = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const qsa = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)];

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => dateKey(new Date());
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeXml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const normalizeDoi = (doi: string) => doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
const tagsFrom = (value: string) => [...new Set(value.split(",").map(tag => tag.trim()).filter(Boolean))];

type ArticleMetadata = { title: string; authors: string; journal: string; year: string; url: string; tags: string[]; source: string };
type NativeDoiResult = { id: string; source?: "Crossref" | "DataCite"; data?: CrossrefMessage | DataCiteAttributes; error?: string };
const nativeDoiCallbacks = new Map<string, { resolve: (value: NativeDoiResult) => void; reject: (error: Error) => void; timer: number }>();
let doiLookupTimer = 0;

const runtimeGlobal = globalThis as typeof globalThis & { __litreaderDoiResult?: (result: NativeDoiResult) => void };
runtimeGlobal.__litreaderDoiResult = (result: NativeDoiResult) => {
  const callback = nativeDoiCallbacks.get(result.id);
  if (!callback) return;
  window.clearTimeout(callback.timer);
  nativeDoiCallbacks.delete(result.id);
  if (result.error) callback.reject(new Error(result.error));
  else callback.resolve(result);
};

function nativeDoiLookup(doi: string) {
  return new Promise<NativeDoiResult>((resolve, reject) => {
    const id = uid();
    const timer = window.setTimeout(() => {
      nativeDoiCallbacks.delete(id);
      reject(new Error("The DOI lookup timed out."));
    }, 15000);
    nativeDoiCallbacks.set(id, { resolve, reject, timer });
    window.webkit?.messageHandlers?.doiLookup?.postMessage({ id, doi });
  });
}

function setFormValue(name: string, value: string) {
  const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
  if (field && value) field.value = value;
}

function crossrefMetadata(message: CrossrefMessage): ArticleMetadata {
  const date = message.issued ?? message["published-print"] ?? message["published-online"] ?? message.created;
  return {
    title: message.title?.[0] ?? "",
    authors: (message.author ?? []).map(author => [author.given, author.family].filter(Boolean).join(" ") || author.name).filter(Boolean).join(", "),
    journal: message["container-title"]?.[0] ?? message.publisher ?? "",
    year: String(date?.["date-parts"]?.[0]?.[0] ?? ""),
    url: message.URL ?? "",
    tags: (message.subject ?? []).filter(Boolean).slice(0, 6),
    source: "Crossref"
  };
}

function dataciteMetadata(attributes: DataCiteAttributes): ArticleMetadata {
  return {
    title: attributes.titles?.[0]?.title ?? attributes.title ?? "",
    authors: (attributes.creators ?? []).map(author => author.name ?? [author.givenName, author.familyName].filter(Boolean).join(" ")).filter(Boolean).join(", "),
    journal: attributes.container?.title ?? attributes.publisher ?? "",
    year: String(attributes.publicationYear ?? ""),
    url: attributes.url ?? "",
    tags: (attributes.subjects ?? []).map(subject => subject.subject).filter((subject): subject is string => Boolean(subject)).slice(0, 6),
    source: "DataCite"
  };
}

async function fetchDoiMetadata() {
  const doi = normalizeDoi(formValue("doi"));
  if (!/^10\.\d{4,9}\/.+/.test(doi)) return toast("Enter a complete DOI, such as 10.1038/s41586-024-00000-0.", "warn");
  const button = qs<HTMLButtonElement>("#fetchDoi");
  window.clearTimeout(doiLookupTimer);
  if (button.disabled) return;
  button.disabled = true; button.textContent = "Looking up…";
  qs("#doiStatus").textContent = "Searching Crossref and DataCite…";
  try {
    let metadata: ArticleMetadata | null = null;
    const nativeHandler = window.webkit?.messageHandlers?.doiLookup;
    if (nativeHandler) {
      const result = await nativeDoiLookup(doi);
      metadata = result.source === "Crossref" ? crossrefMetadata((result.data ?? {}) as CrossrefMessage) : dataciteMetadata((result.data ?? {}) as DataCiteAttributes);
    } else {
      try {
        const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
        if (response.ok) metadata = crossrefMetadata(((await response.json()) as { message: CrossrefMessage }).message);
      } catch { /* Try DataCite next. */ }
      if (!metadata?.title) {
        const response = await fetch(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`);
        if (response.ok) metadata = dataciteMetadata(((await response.json()) as { data?: { attributes?: DataCiteAttributes } }).data?.attributes ?? {});
      }
    }
    if (!metadata?.title) throw new Error();
    setFormValue("doi", doi);
    setFormValue("title", metadata.title);
    setFormValue("authors", metadata.authors);
    setFormValue("journal", metadata.journal);
    setFormValue("year", metadata.year);
    setFormValue("url", metadata.url || `https://doi.org/${doi}`);
    if (!formValue("tags") && metadata.tags.length) setFormValue("tags", metadata.tags.join(", "));
    qs("#editorHeading").textContent = "New reading note";
    qs("#doiStatus").textContent = `Retrieved from ${metadata.source}.`;
    toast(`Article information retrieved from ${metadata.source}.`);
  } catch {
    qs("#doiStatus").textContent = "Lookup failed. Check the DOI and your internet connection.";
    toast("No article information was found for that DOI.", "warn");
  }
  finally { button.disabled = false; button.textContent = "Retrieve"; }
}

let entries: ReadingEntry[] = load<ReadingEntry[]>(STORAGE_KEY, []);
let settings: Settings = load<Settings>(SETTINGS_KEY, {
  googleEndpoint: "", googleToken: "", zoteroUserId: "", zoteroApiKey: ""
});
let activeId: string | null = null;
let activeFilter = "All";

function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  render();
}

function toast(message: string, tone: "ok" | "warn" = "ok") {
  const el = qs("#toast");
  el.textContent = message;
  el.className = `toast show ${tone}`;
  window.setTimeout(() => el.classList.remove("show"), 2800);
}

function emptyEntry(): ReadingEntry {
  return {
    id: uid(), title: "", authors: "", journal: "", year: "", doi: "", url: "",
    readDate: today(), status: "Read", rating: 0, tags: [], keyPoints: "", methods: "",
    limitations: "", thinking: "", nextSteps: "", createdAt: now(), updatedAt: now()
  };
}

function formValue(name: string) {
  return (qs<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)).value.trim();
}

function readForm(): ReadingEntry {
  const previous = entries.find(entry => entry.id === activeId);
  return {
    ...(previous ?? emptyEntry()),
    id: activeId ?? uid(),
    title: formValue("title"), authors: formValue("authors"), journal: formValue("journal"),
    year: formValue("year"), doi: normalizeDoi(formValue("doi")), url: formValue("url"),
    readDate: formValue("readDate"), status: formValue("status") as ReadingStatus,
    rating: Number(formValue("rating")) || 0, tags: tagsFrom(formValue("tags")),
    keyPoints: formValue("keyPoints"), methods: formValue("methods"),
    limitations: formValue("limitations"), thinking: formValue("thinking"),
    nextSteps: formValue("nextSteps"), updatedAt: now()
  };
}

function fillForm(entry: ReadingEntry) {
  activeId = entry.id;
  for (const [name, value] of Object.entries(entry)) {
    const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
    if (field && name !== "tags") field.value = String(value ?? "");
  }
  qs<HTMLInputElement>('[name="tags"]').value = entry.tags.join(", ");
  qs("#editorHeading").textContent = entry.title ? "Edit reading note" : "New reading note";
  qs("#deleteEntry").classList.toggle("hidden", !entries.some(item => item.id === entry.id));
  qs<HTMLInputElement>('[name="title"]').focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  qs<HTMLFormElement>("#entryForm").reset();
  fillForm(emptyEntry());
}

function saveEntry(event?: Event) {
  event?.preventDefault();
  const entry = readForm();
  if (!entry.title) {
    toast("Add an article title first.", "warn");
    qs<HTMLInputElement>('[name="title"]').focus();
    return;
  }
  const index = entries.findIndex(item => item.id === entry.id);
  if (index >= 0) entries[index] = entry;
  else entries.unshift(entry);
  activeId = entry.id;
  persist();
  toast(index >= 0 ? "Reading note updated." : "Reading note saved.");
  qs("#deleteEntry").classList.remove("hidden");
}

function filteredEntries() {
  const query = qs<HTMLInputElement>("#search").value.trim().toLowerCase();
  return entries
    .filter(entry => activeFilter === "All" || entry.status === activeFilter)
    .filter(entry => !query || [entry.title, entry.authors, entry.journal, entry.tags.join(" "), entry.doi]
      .join(" ").toLowerCase().includes(query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function heatmapModel(sourceEntries: ReadingEntry[], weeks = 16, end = new Date()) {
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12);
  const weekdayFromMonday = (endDay.getDay() + 6) % 7;
  const start = new Date(endDay);
  start.setDate(start.getDate() - ((weeks - 1) * 7 + weekdayFromMonday));
  const counts = new Map<string, number>();
  sourceEntries.forEach(entry => {
    if (entry.readDate) counts.set(entry.readDate, (counts.get(entry.readDate) ?? 0) + 1);
  });
  const days = Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(start); date.setDate(start.getDate() + index);
    const key = dateKey(date), count = counts.get(key) ?? 0;
    return { key, count, future: date > endDay, level: count ? Math.min(count, 4) : 0 };
  });
  let streak = 0;
  const cursor = new Date(endDay);
  while ((counts.get(dateKey(cursor)) ?? 0) > 0) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return { days, streak };
}

function renderHeatmap() {
  const { days, streak } = heatmapModel(entries);
  qs("#streakCount").textContent = String(streak);
  qs("#heatmap").innerHTML = days.map(day => `<span class="heat-day level-${day.level}${day.future ? " future" : ""}" title="${day.key}: ${day.count} article${day.count === 1 ? "" : "s"}" aria-label="${day.key}, ${day.count} articles"></span>`).join("");
}

function render() {
  const list = qs("#entryList");
  const visible = filteredEntries();
  list.innerHTML = visible.length ? visible.map(entry => `
    <article class="entry-card ${entry.id === activeId ? "active" : ""}" data-id="${entry.id}">
      <div class="entry-topline">
        <span class="status-dot status-${entry.status.toLowerCase().replace(" ", "-")}"></span>
        <span>${escapeXml(entry.status)}</span>
        <time>${escapeXml(entry.readDate || "No date")}</time>
      </div>
      <h3>${escapeXml(entry.title)}</h3>
      <p>${escapeXml([entry.authors, entry.journal, entry.year].filter(Boolean).join(" · ") || "Citation details not added")}</p>
      <div class="tag-row">${entry.tags.slice(0, 4).map(tag => `<span>${escapeXml(tag)}</span>`).join("")}</div>
    </article>`).join("") : `
    <div class="empty-state"><span>∿</span><h3>No notes here yet</h3><p>Log the first paper you read today.</p></div>`;

  qsa(".entry-card").forEach(card => card.addEventListener("click", () => {
    const entry = entries.find(item => item.id === (card as HTMLElement).dataset.id);
    if (entry) fillForm(entry);
  }));
  qs("#entryCount").textContent = String(entries.length);
  qs("#readCount").textContent = String(entries.filter(entry => entry.status === "Read").length);
  const month = today().slice(0, 7);
  qs("#monthCount").textContent = String(entries.filter(entry => entry.readDate.startsWith(month)).length);
  renderHeatmap();
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function zipStore(files: { name: string; data: string }[]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  const u16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true);
  const u32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true);
  for (const file of files) {
    const name = encoder.encode(file.name), data = encoder.encode(file.data), crc = crc32(data);
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u32(lv, 14, crc);
    u32(lv, 18, data.length); u32(lv, 22, data.length); u16(lv, 26, name.length); local.set(name, 30);
    chunks.push(local, data);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u32(cv, 16, crc);
    u32(cv, 20, data.length); u32(cv, 24, data.length); u16(cv, 28, name.length); u32(cv, 42, offset); central.set(name, 46);
    directory.push(central); offset += local.length + data.length;
  }
  const dirSize = directory.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length);
  u32(ev, 12, dirSize); u32(ev, 16, offset);
  const parts = [...chunks, ...directory, end].map(bytes => new Uint8Array(bytes).buffer);
  return new Blob(parts, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function worksheetXml(rows: unknown[][]) {
  const col = (index: number) => {
    let result = "";
    for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
    return result;
  };
  const sheetRows = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => {
    const ref = `${col(c)}${r + 1}`;
    const style = r === 0 ? ' s="1"' : "";
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  }).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${[18,14,28,22,10,14,14,12,9,22,42,32,32,42,32,24,24].map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:Q${Math.max(rows.length, 1)}"/></worksheet>`;
}

export function createXlsxBlob(sourceEntries: ReadingEntry[]) {
  const headers = ["Read date", "Status", "Title", "Authors", "Year", "Journal", "DOI", "URL", "Rating", "Tags", "Key points", "Methods", "Limitations", "Thinking", "Next steps", "Created", "Updated"];
  const rows = sourceEntries.map(e => [e.readDate, e.status, e.title, e.authors, e.year, e.journal, e.doi, e.url, e.rating || "", e.tags.join(", "), e.keyPoints, e.methods, e.limitations, e.thinking, e.nextSteps, e.createdAt, e.updatedAt]);
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Reading log" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF203F36"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>` },
    { name: "xl/worksheets/sheet1.xml", data: worksheetXml([headers, ...rows]) }
  ];
  return zipStore(files);
}

function exportXlsx() {
  if (!entries.length) return toast("Save a reading note before exporting.", "warn");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(createXlsxBlob(entries));
  link.download = `LitReader-${today()}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast("XLSX exported.");
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: now(), entries }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = `LitReader-backup-${today()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000); toast("Local backup downloaded.");
}

async function importBackup(file?: File) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()) as { entries?: ReadingEntry[] } | ReadingEntry[];
    const imported = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(imported) || imported.some(entry => !entry.id || !entry.title)) throw new Error();
    const byId = new Map(entries.map(entry => [entry.id, entry]));
    imported.forEach(entry => byId.set(entry.id, entry)); entries = [...byId.values()]; persist();
    toast(`Imported ${imported.length} reading note${imported.length === 1 ? "" : "s"}.`);
  } catch { toast("That file is not a valid LitReader backup.", "warn"); }
  qs<HTMLInputElement>("#backupFile").value = "";
}

async function syncGoogle() {
  if (!settings.googleEndpoint) { openSettings("google"); return; }
  try {
    await fetch(settings.googleEndpoint, {
      method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "replace", token: settings.googleToken, records: entries })
    });
    toast("Sync request sent to Google Sheets.");
  } catch { toast("Google Sheets sync could not be sent.", "warn"); }
}

async function importZotero() {
  if (!settings.zoteroUserId || !settings.zoteroApiKey) { openSettings("zotero"); return; }
  const button = qs<HTMLButtonElement>("#zoteroImport");
  button.disabled = true; button.textContent = "Importing…";
  try {
    const response = await fetch(`https://api.zotero.org/users/${encodeURIComponent(settings.zoteroUserId)}/items?itemType=-attachment&limit=100&sort=dateModified&direction=desc`, { headers: { "Zotero-API-Key": settings.zoteroApiKey, "Zotero-API-Version": "3" } });
    if (!response.ok) throw new Error();
    const items = await response.json() as Array<{ data: ZoteroItemData }>;
    let added = 0;
    for (const item of items) {
      const data = item.data;
      const title = data.title;
      const doi = normalizeDoi(data.DOI ?? "");
      if (!title || entries.some(e => doi ? e.doi.toLowerCase() === doi.toLowerCase() : e.title.toLowerCase() === title.toLowerCase())) continue;
      entries.push({ ...emptyEntry(), title, authors: (data.creators ?? []).map(c => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || "").join(", "), journal: data.publicationTitle ?? data.bookTitle ?? "", year: String(data.date ?? "").match(/\d{4}/)?.[0] ?? "", doi, url: data.url ?? "", readDate: "", status: "To read", tags: (data.tags ?? []).map(t => t.tag).filter((tag): tag is string => Boolean(tag)) });
      added++;
    }
    persist(); toast(added ? `Imported ${added} item${added === 1 ? "" : "s"} from Zotero.` : "Zotero is already up to date.");
  } catch { toast("Zotero import failed. Check the library ID and key.", "warn"); }
  finally { button.disabled = false; button.textContent = "Import Zotero"; }
}

async function sendToZotero() {
  if (!settings.zoteroUserId || !settings.zoteroApiKey) { openSettings("zotero"); return; }
  const entry = entries.find(e => e.id === activeId) ?? readForm();
  if (!entry.title) return toast("Choose or save an article first.", "warn");
  try {
    const payload = [{ itemType: "journalArticle", title: entry.title, creators: entry.authors.split(/,|;/).filter(Boolean).map(name => ({ creatorType: "author", name: name.trim() })), publicationTitle: entry.journal, date: entry.year, DOI: entry.doi, url: entry.url, tags: entry.tags.map(tag => ({ tag })), notes: [{ note: `<p><strong>Key points</strong></p><p>${escapeXml(entry.keyPoints).replaceAll("\n", "<br>")}</p><p><strong>Thinking</strong></p><p>${escapeXml(entry.thinking).replaceAll("\n", "<br>")}</p>` }] }];
    const response = await fetch(`https://api.zotero.org/users/${encodeURIComponent(settings.zoteroUserId)}/items`, { method: "POST", headers: { "Content-Type": "application/json", "Zotero-API-Key": settings.zoteroApiKey, "Zotero-API-Version": "3" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error();
    toast("Article sent to Zotero.");
  } catch { toast("Could not send to Zotero. Check write access.", "warn"); }
}

const appsScript = `const HEADERS = ['Read date','Status','Title','Authors','Year','Journal','DOI','URL','Rating','Tags','Key points','Methods','Limitations','Thinking','Next steps','Created','Updated'];
function doPost(e) {
  const p = JSON.parse(e.postData.contents), expected = PropertiesService.getScriptProperties().getProperty('LITREADER_TOKEN');
  if (expected && p.token !== expected) return ContentService.createTextOutput('unauthorized');
  const s = SpreadsheetApp.getActive().getSheetByName('Reading log') || SpreadsheetApp.getActive().insertSheet('Reading log');
  const rows = p.records.map(x => [x.readDate,x.status,x.title,x.authors,x.year,x.journal,x.doi,x.url,x.rating,x.tags.join(', '),x.keyPoints,x.methods,x.limitations,x.thinking,x.nextSteps,x.createdAt,x.updatedAt]);
  s.clearContents(); s.getRange(1,1,1,HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#203f36').setFontColor('#ffffff');
  if (rows.length) s.getRange(2,1,rows.length,HEADERS.length).setValues(rows).setWrap(true).setVerticalAlignment('top');
  s.setFrozenRows(1); return ContentService.createTextOutput('ok');
}`;

function openSettings(tab = "google") {
  qs<HTMLInputElement>('[name="googleEndpoint"]').value = settings.googleEndpoint;
  qs<HTMLInputElement>('[name="googleToken"]').value = settings.googleToken;
  qs<HTMLInputElement>('[name="zoteroUserId"]').value = settings.zoteroUserId;
  qs<HTMLInputElement>('[name="zoteroApiKey"]').value = settings.zoteroApiKey;
  qs<HTMLTextAreaElement>("#appsScript").value = appsScript;
  qsa(".settings-tab").forEach(button => button.classList.toggle("active", (button as HTMLElement).dataset.tab === tab));
  qsa(".settings-panel").forEach(panel => panel.classList.toggle("active", panel.id === `${tab}Panel`));
  const dialog = qs<HTMLDialogElement>("#settingsDialog");
  if (!dialog.open) dialog.showModal();
}

function init() {
  qs<HTMLInputElement>('[name="readDate"]').value = today();
  qs("#entryForm").addEventListener("submit", saveEntry);
  qs("#newEntry").addEventListener("click", resetForm);
  const doiInput = qs<HTMLInputElement>('[name="doi"]');
  if (!window.__litreaderNativeOwnsDoiLookup) {
    qs("#fetchDoi").addEventListener("click", fetchDoiMetadata);
    doiInput.addEventListener("input", () => {
      window.clearTimeout(doiLookupTimer);
      if (/^10\.\d{4,9}\/.+/.test(normalizeDoi(doiInput.value))) doiLookupTimer = window.setTimeout(fetchDoiMetadata, 800);
    });
    doiInput.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); fetchDoiMetadata(); } });
  }
  qs("#exportXlsx").addEventListener("click", exportXlsx);
  qs("#googleSync").addEventListener("click", syncGoogle);
  qs("#zoteroImport").addEventListener("click", importZotero);
  qs("#zoteroSend").addEventListener("click", sendToZotero);
  qs("#openSettings").addEventListener("click", () => openSettings());
  qs("#closeSettings").addEventListener("click", () => qs<HTMLDialogElement>("#settingsDialog").close());
  qs("#copyScript").addEventListener("click", async () => { await navigator.clipboard.writeText(appsScript); toast("Apps Script copied."); });
  qs("#exportBackup").addEventListener("click", exportBackup);
  qs("#importBackup").addEventListener("click", () => qs<HTMLInputElement>("#backupFile").click());
  qs("#backupFile").addEventListener("change", event => importBackup((event.target as HTMLInputElement).files?.[0]));
  qs("#saveSettings").addEventListener("click", () => {
    settings = { googleEndpoint: formValue("googleEndpoint"), googleToken: formValue("googleToken"), zoteroUserId: formValue("zoteroUserId"), zoteroApiKey: formValue("zoteroApiKey") };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    qs<HTMLDialogElement>("#settingsDialog").close(); toast("Connections saved on this device.");
  });
  qs("#deleteEntry").addEventListener("click", () => {
    const entry = entries.find(item => item.id === activeId);
    if (!entry || !confirm(`Delete “${entry.title}”?`)) return;
    entries = entries.filter(item => item.id !== activeId); persist(); resetForm(); toast("Reading note deleted.");
  });
  qs("#search").addEventListener("input", render);
  qsa(".filter-chip").forEach(button => button.addEventListener("click", () => {
    activeFilter = (button as HTMLElement).dataset.filter ?? "All";
    qsa(".filter-chip").forEach(item => item.classList.toggle("active", item === button)); render();
  }));
  qsa(".settings-tab").forEach(button => button.addEventListener("click", () => openSettings((button as HTMLElement).dataset.tab)));
  resetForm(); render();
}

if (document.readyState !== "interactive" && document.readyState !== "complete") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
