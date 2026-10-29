// Run: node verify.cjs. No dependencies; all network calls are isolated mocks.
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new vm.Script(script); // Validate the exact shipped JavaScript before instrumentation.
const elements = new Map(),
  storage = new Map(),
  timers = new Set();
function element() {
  return {
    value: "",
    checked: false,
    hidden: false,
    textContent: "",
    disabled: false,
    style: {},
    dataset: {},
    append() {},
    remove() {},
    setAttribute() {},
    replaceChildren() {},
    focus() {},
    close() {},
    showModal() {},
  };
}
const context = vm.createContext({
  console,
  URL,
  Blob,
  AbortController,
  TypeError,
  Date,
  JSON,
  Math,
  Object,
  Array,
  String,
  Number,
  Map,
  Set,
  RegExp,
  crypto: require("node:crypto").webcrypto,
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
    createTextNode: (s) => s,
    querySelectorAll: () => [],
  },
  localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
  setTimeout(fn, ms) {
    const t = setTimeout(fn, ms);
    t.unref();
    timers.add(t);
    return t;
  },
  clearTimeout,
  fetch: async () => {
    throw Error("Unexpected real network request");
  },
});
const end = script.indexOf("// ---- UI bindings below");
if (end < 0) throw Error("UI boundary marker missing from index.html");
const exportCode = `renderOutput=()=>{};renderHistory=()=>{};renderLibrary=()=>{};renderPresetOptions=()=>{};renderRig=()=>{};renderTimeline=()=>{};renderDirector=()=>{};renderPerformance=()=>{};hydrate=()=>{workingHistoryId=null;revision++;persist();};globalThis.test={PLATFORMS,TARGETS,extractJSON,writeHistory,isLocalHost,responseFormatOf,SCHEMAS,humanBasisJSON,hashText,POSITIVE_KEYS,cleanPerformance,performanceContext,cleanHuman,validateHuman,humanBasis,humanCurrent,HUMAN_EXAMPLE,humanExamplePlan,cleanGuidance,strictRig,parseDirectorPlan,directorSignature,cleanProposal,acceptDirector,cleanRig,defaultRig,rigPrompt,applyRig,blankTimeline,cleanTimeline,cleanDraft,timelineIssues,parseTimelineAI,BOAT_TIMELINE,cleanSlots,cleanHistory,cleanLibrary,cleanUI,trimHistory,blankSlots,outputFor,endpoint,backupPayload,mergeBackup,saveHistory,expand,syncGist,settingsToForm,addTombstone,fetchJSON,loadExample,SLOT_KEYS,DIMENSIONS,DEFAULT_NEG,EXAMPLES,get state(){return state;},set state(v){state=v;},get credentials(){return credentials;},set credentials(v){credentials=v;},edit(){revision++;},get busy(){return aiController!==null;}};})();`;
vm.runInContext(script.slice(0, end) + exportCode, context);
const t = context.test,
  $ = (id) => context.document.getElementById(id);
let count = 0;
function check(name, fn) {
  fn();
  console.log("PASS", name);
  count++;
}
async function asyncCheck(name, fn) {
  await fn();
  console.log("PASS", name);
  count++;
}
const json = (x) => JSON.parse(JSON.stringify(x));
const response = (x) => ({ ok: true, text: async () => JSON.stringify(x) });
(async () => {
  check("seven built-in bilingual dimensions including audio, without invalid --motion 5", () => {
    assert.equal(t.DIMENSIONS.length, 7);
    assert(t.SLOT_KEYS.includes("audio"));
    assert(!t.DIMENSIONS.flatMap((d) => d.terms).some((x) => x[2] === "--motion 5"));
    assert(t.DIMENSIONS.flatMap((d) => d.terms).length >= 55);
    assert(t.DIMENSIONS[0].terms.some((x) => x[2] === "FPV Drone Dynamic Tracking"));
    assert.equal(t.blankSlots().negative.en, t.DEFAULT_NEG);
  });
  check("strict JSON rejects missing dimensions, strings, extra keys, long values", () => {
    for (const x of [{}, [], null, { camera: "x" }, { ...t.blankSlots(), extra: {} }])
      assert.throws(() => t.cleanSlots(x, true));
    const full = Object.fromEntries(t.SLOT_KEYS.map((k) => [k, { zh: "中文", en: "English" }]));
    assert.equal(t.cleanSlots(full, true).subject.en, "English");
    const noAudio = { ...full };
    delete noAudio.audio;
    assert.deepEqual(json(t.cleanSlots(noAudio, true).audio), { zh: "", en: "" });
    assert.equal(t.cleanSlots({ ...full, audio: { zh: "", en: "" } }, true).audio.en, "");
    assert.throws(() => t.cleanSlots({ ...full, subject: { zh: "", en: "x" } }, true));
    assert.throws(() => t.cleanSlots({ ...full, action: { zh: "x", en: "x".repeat(12001) } }, true));
  });
  check("endpoint normalization and credential URL rejection", () => {
    assert.equal(t.endpoint("https://api.deepseek.com/v1/"), "https://api.deepseek.com/v1/chat/completions");
    assert.equal(
      t.endpoint("http://localhost:11434/v1/chat/completions"),
      "http://localhost:11434/v1/chat/completions",
    );
    for (const s of [
      "http://example.com/v1",
      "http://8.8.8.8/v1",
      "https://user:pass@example.com",
      "https://example.com?key=SECRET",
      "javascript:alert(1)",
    ])
      assert.throws(() => t.endpoint(s));
    assert.equal(t.endpoint("http://192.168.1.20:11434/v1"), "http://192.168.1.20:11434/v1/chat/completions");
    assert(t.isLocalHost("10.0.0.5") && t.isLocalHost("172.20.1.1") && t.isLocalHost("mac.local"));
    assert(!t.isLocalHost("172.40.1.1"));
  });
  check("example loads complete bilingual scene and records history", () => {
    t.loadExample("cat");
    assert.equal(t.state.history.length, 1);
    assert.equal(t.state.draft.slots.subject.en, t.EXAMPLES.cat.subject[1]);
    t.saveHistory(false);
    assert.equal(t.state.history.length, 1);
  });
  check("every platform profile exports prose (no invented bracket labels), keeps negatives separate", () => {
    for (const target of t.TARGETS)
      for (const lang of ["en", "zh"]) {
        t.state.ui = { target, language: lang };
        const o = t.outputFor(lang);
        assert(o.positive.length > 80, target);
        assert(!o.positive.includes("deformed limbs"));
        assert(o.negative.length > 10);
        assert(!o.positive.startsWith("[镜头语言]") && !o.positive.startsWith("[Camera"), target);
      }
  });
  check(
    "platform differences: sections for Sora/Veo, audio dropped where unsupported, Midjourney is motion-only",
    () => {
      t.state.ui = { target: "sora", language: "en" };
      let o = t.outputFor("en");
      assert(o.positive.includes("Cinematography: "));
      assert(o.positive.includes("Audio: Soft rain"));
      t.state.ui = { target: "runway", language: "en" };
      o = t.outputFor("en");
      assert(!o.positive.includes("Audio:"));
      assert(o.notes.some((x) => x.includes("不生成声音")));
      assert(o.positive.startsWith("A low-angle"));
      t.state.ui = { target: "midjourney", language: "en" };
      o = t.outputFor("en");
      assert(/--motion (low|high)$/.test(o.positive));
      assert(!o.positive.includes("amber eyes"));
      assert(o.positive.includes("reference image"));
      t.state.ui = { target: "kling", language: "zh" };
      o = t.outputFor("zh");
      assert(o.positive.startsWith("一只琥珀色眼睛"));
      assert(!o.positive.includes(", "));
      t.state.ui = { target: "generic", language: "en" };
    },
  );
  check("image-to-video mode exports motion, camera and audio but not appearance", () => {
    t.state.ui = { target: "kling", language: "en", i2v: true };
    const o = t.outputFor("en");
    assert(o.positive.includes("reference image"));
    assert(!o.positive.includes("amber eyes"));
    assert(!o.positive.includes("Kodak"));
    assert(o.positive.includes("blinks gently"));
    assert(o.positive.includes("Audio:"));
    t.state.ui = { target: "generic", language: "en" };
  });
  check("Hailuo gets documented camera commands only when the rig was applied", () => {
    t.state.ui = { target: "minimax", language: "en" };
    assert(!t.outputFor("en").positive.startsWith("[Push in]"));
    t.state.draft.rig = { ...t.defaultRig(), movement: "dolly" };
    t.applyRig();
    assert(t.outputFor("en").positive.startsWith("[Push in] "));
    t.state.ui = { target: "generic", language: "en" };
    t.loadExample("cat");
  });
  check("soft length limit adds a note without blocking export", () => {
    t.state.ui = { target: "runway", language: "en" };
    const before = t.state.draft.slots.environment.en;
    t.state.draft.slots.environment.en = "x ".repeat(600);
    const o = t.outputFor("en");
    assert(o.notes.some((x) => x.includes("1000")));
    assert.equal(o.issues.length, 0);
    t.state.draft.slots.environment.en = before;
    t.state.ui = { target: "generic", language: "en" };
  });
  check("camera rig produces bilingual optics and body references", () => {
    for (const body of ["none", "alexa35", "venice", "fx3", "pocket", "film16"]) {
      const rig = { ...t.defaultRig(), body, focal: "85", aperture: "1.4" };
      const p = t.rigPrompt(rig);
      assert(p.zh.includes("85mm"));
      assert(p.en.includes("85mm"));
      assert(p.en.includes("f/1.4"));
      if (body === "none") assert(!p.en.includes("camera reference"));
      else assert(p.en.includes("camera reference"));
    }
    assert.equal(t.cleanRig({ body: "<script>" }).body, "none");
    assert.equal(t.cleanRig({ ...t.defaultRig(), shot: "aerial", angle: "low" }).angle, "high");
  });
  check("applying camera replaces only the camera slot and preserves original history", () => {
    const other = json(t.state.draft.slots.subject),
      old = t.state.draft.slots.camera.en;
    t.state.draft.rig = { ...t.defaultRig(), body: "alexa35", focal: "85" };
    t.applyRig();
    assert(t.state.draft.slots.camera.en.includes("85mm"));
    assert(!t.state.draft.slots.camera.en.includes("35mm"));
    assert.deepEqual(json(t.state.draft.slots.subject), other);
    assert(t.state.history.some((x) => x.slots.camera.en === old));
    t.applyRig();
    assert.equal((t.state.draft.slots.camera.en.match(/85mm/g) || []).length, 1);
  });
  check("legacy draft and history migrate without losing six-slot content", () => {
    const old = { idea: "legacy", slots: t.blankSlots() };
    old.slots.subject = { zh: "猫", en: "cat" };
    const migrated = t.cleanDraft(old);
    assert.equal(migrated.slots.subject.en, "cat");
    delete old.slots.audio;
    assert.equal(t.cleanDraft(old).slots.audio.en, "");
    assert.equal(migrated.timeline.enabled, false);
    assert.equal(migrated.rig.focal, "35");
  });
  check("ten-second boat example has complete contiguous bilingual timeline", () => {
    t.loadExample("boat");
    const timeline = t.state.draft.timeline;
    assert.equal(timeline.duration, 10);
    assert.equal(timeline.enabled, true);
    assert.equal(timeline.segments.length, 6);
    assert.equal(t.timelineIssues(timeline, "en").length, 0);
    assert.equal(t.timelineIssues(timeline, "zh").length, 0);
    assert.equal(timeline.segments[3].end - timeline.segments[3].start, 0.5);
  });
  check("timecoded export replaces general action, preserves labels and separates negative", () => {
    t.state.ui = { target: "generic", language: "en" };
    const out = t.outputFor("en");
    assert(out.positive.includes("[5.5–6.0s]"));
    assert(out.positive.includes("Total duration: 10.0 seconds"));
    assert(!out.positive.includes(t.state.draft.slots.action.en));
    assert(!out.positive.includes("deformed limbs"));
    assert(out.negative.includes("deformed limbs"));
    assert.equal(out.issues.length, 0);
  });
  check("timeline rejects overlap, gaps, invalid precision, bounds and empty language", () => {
    for (const mutate of [
      (t) => (t.segments[1].start = 1),
      (t) => (t.segments[1].start = 2.1),
      (t) => (t.segments[0].end = 0.05),
      (t) => (t.segments.at(-1).end = 11),
      (t) => (t.segments[0].en = ""),
      (t) => (t.segments[0].start = null),
    ]) {
      const x = json(t.BOAT_TIMELINE);
      mutate(x);
      assert(t.timelineIssues(x, "en").length > 0);
    }
    const empty = { ...t.blankTimeline(), enabled: true };
    assert(t.timelineIssues(empty, "en").length > 0);
  });
  check("invalid timecodes do not enter positive export", () => {
    t.state.draft.timeline.segments[1].start = 1;
    const out = t.outputFor("en");
    assert(out.issues.length > 0);
    assert(!out.positive.includes("[5.5–6.0s]"));
    t.state.draft.timeline = json(t.BOAT_TIMELINE);
  });
  check("strict AI timeline validates requested duration and continuity atomically", () => {
    const data = json(t.BOAT_TIMELINE);
    delete data.enabled;
    assert.equal(t.parseTimelineAI(data, 10, true).segments.length, 6);
    for (const invalid of [
      { ...data, duration: 9 },
      { ...data, continuous: false },
      { ...data, segments: [{ start: 0, end: 10, zh: "x", en: "x" }] },
    ])
      assert.throws(() => t.parseTimelineAI(invalid, 10, true));
  });
  check("camera and timeline are preserved through history and allowlisted backup merge", () => {
    t.state.draft.rig = { ...t.defaultRig(), body: "fx3" };
    t.saveHistory(false);
    const row = t.state.history.find((x) => x.timeline.enabled && x.rig.body === "fx3");
    assert(row);
    const backup = json(t.backupPayload());
    const remote = backup.history.find((x) => x.id === row.id);
    assert.equal(remote.timeline.segments[3].start, 5.5);
    assert.equal(remote.rig.body, "fx3");
    t.mergeBackup(backup);
    assert(t.state.history.some((x) => x.rig.body === "fx3" && x.timeline.duration === 10));
    t.state.draft.timeline = t.blankTimeline();
  });
  check("favorites are pinned and never evicted by the 50 recent entries", () => {
    const base = json(t.state.history[0]);
    t.state.history = Array.from({ length: 70 }, (_, i) => ({
      ...base,
      id: "id" + i,
      createdAt: new Date(1700000000000 + i * 1000).toISOString(),
      favorite: i === 3,
    }));
    t.state.history = t.trimHistory(t.state.history);
    assert.equal(t.state.history.length, 51);
    assert.equal(t.state.history[0].id, "id3");
    assert(!t.state.history.some((x) => x.id === "id0"));
    assert(t.state.history.some((x) => x.id === "id69"));
  });
  check("autosave updates one working entry instead of adding a row per pause", () => {
    t.state.history = [];
    t.loadExample("cat");
    const n = t.state.history.length;
    for (const s of ["A", "A cat", "A cat in", "A cat in rain"]) {
      t.state.draft.slots.subject.en = s;
      t.writeHistory(false);
    }
    assert.equal(t.state.history.length, n + 1);
    assert.equal(t.state.history.filter((x) => x.slots.subject.en.startsWith("A cat")).length, 1);
    t.saveHistory(false);
    t.state.draft.slots.subject.en = "A different cat";
    t.writeHistory(false);
    assert.equal(t.state.history.length, n + 2);
    assert(t.state.history.some((x) => x.slots.subject.en === "A cat in rain"));
  });
  check("a favorite survives many later saves and is never overwritten by autosave", () => {
    t.state.history[0].favorite = true;
    const fav = json(t.state.history[0]);
    for (let i = 0; i < 60; i++) {
      t.state.draft.slots.subject.en = "scene " + i;
      t.writeHistory(false);
      t.saveHistory(false);
    }
    const kept = t.state.history.find((x) => x.id === fav.id);
    assert(kept);
    assert.equal(kept.slots.subject.en, fav.slots.subject.en);
    assert.equal(t.state.history.filter((x) => !x.favorite).length, 50);
  });
  check("new history remains saved when all 50 previous entries are favorites", () => {
    t.state.history.forEach((x) => (x.favorite = true));
    t.state.draft.idea = "New scene at full favorite capacity";
    t.saveHistory(false);
    assert.equal(t.state.history.filter((x) => !x.favorite).length, 1);
    assert(t.state.history.some((x) => x.idea === "New scene at full favorite capacity"));
  });
  t.credentials = {
    apiBase: "https://example.com/v1",
    apiModel: "test",
    apiKey: "FAKE_API_SECRET_123",
    githubPat: "FAKE_GITHUB_SECRET_456",
    gistId: "",
    jsonMode: false,
  };
  check("backup is allowlisted and removes credential values even inside prompts", () => {
    t.state.draft.idea = "FAKE_API_SECRET_123 FAKE_GITHUB_SECRET_456";
    t.saveHistory(false);
    const payload = JSON.stringify(t.backupPayload());
    assert(!payload.includes("FAKE_API_SECRET_123"));
    assert(!payload.includes("FAKE_GITHUB_SECRET_456"));
    assert(!payload.includes("apiBase"));
    assert(!payload.includes("apiKey"));
    assert(!payload.includes("githubPat"));
    assert(!payload.includes("credentials"));
    assert(payload.includes("[REDACTED]"));
  });
  check("backup validation is atomic and valid merges preserve current draft", () => {
    const before = JSON.stringify(t.state);
    assert.throws(() => t.mergeBackup({ app: "other", version: 1 }));
    assert.equal(JSON.stringify(t.state), before);
    const data = json(t.backupPayload()),
      draft = json(t.state.draft);
    data.history = [{ ...data.history[0], id: "remote-new", idea: "remote" }];
    t.mergeBackup(data);
    assert(t.state.history.some((v) => v.id === "remote-new"));
    assert.deepEqual(json(t.state.draft), draft);
    assert.throws(() => t.mergeBackup({ ...data, history: [{}] }));
  });
  check("deletion tombstones stop older cloud records from reappearing", () => {
    const data = json(t.backupPayload()),
      record = data.history[0];
    t.state.history = t.state.history.filter((x) => x.id !== record.id);
    t.addTombstone("history", record.id);
    t.mergeBackup(data);
    assert(!t.state.history.some((x) => x.id === record.id));
  });
  await asyncCheck("malformed AI JSON preserves all existing inputs", async () => {
    const before = JSON.stringify(t.state.draft);
    context.fetch = async () => response({ choices: [{ message: { content: "```json\n{}\n```" } }] });
    let calls = 0;
    const fenced = context.fetch;
    context.fetch = async (...a) => {
      calls++;
      return fenced(...a);
    };
    await t.expand();
    assert.equal(calls, 2);
    assert.equal(JSON.stringify(t.state.draft), before);
    assert.equal(t.busy, false);
    assert($("aiStatus").textContent.includes("自动请求修正一次"));
  });
  await asyncCheck("valid AI JSON fills all 14 fields and sends current slots and platform", async () => {
    const slots = Object.fromEntries(t.SLOT_KEYS.map((k) => [k, { zh: k + "中文", en: k + " English" }]));
    let body;
    context.fetch = async (url, opts) => {
      body = JSON.parse(opts.body);
      return response({ choices: [{ message: { content: JSON.stringify(slots) } }] });
    };
    await t.expand();
    assert.deepEqual(json(t.state.draft.slots), slots);
    assert(body.messages[0].content.includes("Return ONLY"));
    assert.equal(body.messages[1].role, "user");
    const sent = JSON.parse(body.messages[1].content);
    assert(sent.current_slots.subject);
    assert.equal(sent.platform.id, t.state.ui.target);
    assert.equal(typeof sent.image_to_video, "boolean");
  });
  await asyncCheck("fenced or <think>-prefixed answers are extracted, then strictly validated", async () => {
    const slots = Object.fromEntries(t.SLOT_KEYS.map((k) => [k, { zh: k + "中", en: k + " en" }]));
    assert.deepEqual(
      json(
        t.extractJSON(
          "<think>plan {draft}</think>\nHere you go:\n```json\n" + JSON.stringify(slots) + "\n```",
        ),
      ),
      slots,
    );
    assert.deepEqual(json(t.extractJSON("Sure! " + JSON.stringify(slots) + " Hope it helps.")), slots);
    assert.throws(() => t.extractJSON("no json here"));
    assert.throws(() => t.extractJSON('{"camera":'));
    context.fetch = async () =>
      response({
        choices: [{ message: { content: "<think>x</think>```json\n" + JSON.stringify(slots) + "\n```" } }],
      });
    await t.expand();
    assert.equal(t.state.draft.slots.audio.en, "audio en");
  });
  await asyncCheck(
    "one automatic repair round shows the model its answer and the validation error",
    async () => {
      const good = Object.fromEntries(t.SLOT_KEYS.map((k) => [k, { zh: "修复 " + k, en: "fixed " + k }]));
      const bad = { ...good, subject: { zh: "", en: "" } };
      const bodies = [];
      context.fetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        bodies.push(body);
        return response({
          choices: [{ message: { content: JSON.stringify(bodies.length === 1 ? bad : good) } }],
        });
      };
      await t.expand();
      assert.equal(bodies.length, 2);
      assert.equal(bodies[1].messages.length, 4);
      assert.equal(bodies[1].messages[2].role, "assistant");
      assert(bodies[1].messages[3].content.includes("failed validation"));
      assert.equal(t.state.draft.slots.subject.en, "fixed subject");
    },
  );
  await asyncCheck("json_schema mode sends a strict schema that the validators accept", async () => {
    t.credentials = { ...t.credentials, responseFormat: "json_schema" };
    let body;
    const slots = Object.fromEntries(t.SLOT_KEYS.map((k) => [k, { zh: "中", en: "en" }]));
    context.fetch = async (url, opts) => {
      body = JSON.parse(opts.body);
      return response({ choices: [{ message: { content: JSON.stringify(slots) } }] });
    };
    await t.expand();
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.deepEqual(body.response_format.json_schema.schema.required, json(t.SLOT_KEYS));
    const d = t.SCHEMAS.director();
    assert.equal(d.additionalProperties, false);
    assert(d.properties.human.anyOf.some((x) => x.type === "null"));
    assert.deepEqual(json(d.properties.rig.properties.focal.enum), ["24", "35", "50", "85", "100"]);
    t.credentials = { ...t.credentials, responseFormat: "none" };
    assert.equal(t.responseFormatOf({ jsonMode: true }), "json_object");
  });
  await asyncCheck("in-flight AI does not overwrite edits made during request", async () => {
    const before = JSON.stringify(t.state.draft.slots);
    context.fetch = async () => {
      t.edit();
      return response({
        choices: [
          {
            message: {
              content: JSON.stringify(
                Object.fromEntries(t.SLOT_KEYS.map((k) => [k, { zh: "新", en: "new" }])),
              ),
            },
          },
        ],
      });
    };
    await t.expand();
    assert.equal(JSON.stringify(t.state.draft.slots), before);
    assert($("aiStatus").textContent.includes("修改了草稿"));
  });
  await asyncCheck("network failure leaves the existing AI draft intact", async () => {
    const before = JSON.stringify(t.state.draft);
    context.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    await t.expand();
    assert.equal(JSON.stringify(t.state.draft), before);
    assert($("aiStatus").textContent.includes("CORS"));
  });
  await asyncCheck("AI timeline fills the time editor without modifying six dimensions", async () => {
    const before = JSON.stringify(t.state.draft.slots),
      data = json(t.BOAT_TIMELINE);
    delete data.enabled;
    let request;
    context.fetch = async (url, opts) => {
      request = JSON.parse(opts.body);
      return response({ choices: [{ message: { content: JSON.stringify(data) } }] });
    };
    await t.expand("timeline");
    assert.equal(JSON.stringify(t.state.draft.slots), before);
    assert.equal(t.state.draft.timeline.enabled, true);
    assert(request.messages[0].content.includes("storyboard editor"));
  });
  await asyncCheck("invalid AI timeline leaves the existing timeline unchanged", async () => {
    const before = JSON.stringify(t.state.draft.timeline);
    context.fetch = async () =>
      response({
        choices: [
          {
            message: {
              content: JSON.stringify({
                duration: 10,
                continuous: true,
                segments: [{ start: 1, end: 10, zh: "x", en: "x" }],
              }),
            },
          },
        ],
      });
    await t.expand("timeline");
    assert.equal(JSON.stringify(t.state.draft.timeline), before);
  });
  check("credentials pasted into time segments are redacted from backup", () => {
    t.state.draft.timeline.segments[0].en += " FAKE_API_SECRET_123";
    t.saveHistory(false);
    assert(!JSON.stringify(t.backupPayload()).includes("FAKE_API_SECRET_123"));
  });
  const directorFixture = () => ({
    slots: Object.fromEntries(
      t.SLOT_KEYS.map((k) => [
        k,
        k === "negative"
          ? { zh: "畸形，闪烁", en: t.DEFAULT_NEG }
          : { zh: t.EXAMPLES.boat[k][0], en: t.EXAMPLES.boat[k][1] },
      ]),
    ),
    rig: { ...t.defaultRig(), body: "alexa35" },
    timeline: { duration: 10, continuous: true, segments: json(t.BOAT_TIMELINE.segments) },
    advice: {
      camera: {
        zh: "35mm低机位同时保留猫与纸船的位置关系，缓慢推进把注意力引向猫的微表情。",
        en: "A low 35mm view preserves the spatial relationship between cat and boat, while a slow push-in draws attention to its expression.",
      },
      timeline: {
        zh: "先建立环境，再留出观察与抬爪的时间；轻触只占半秒，最后用两秒停留在表情上。",
        en: "Establish the scene, allow time to observe and reach, reserve half a second for contact, and finish with two seconds on the expression.",
      },
    },
  });
  check("director validates whole plan and canonicalizes camera to selected rig", () => {
    const x = directorFixture();
    x.slots.camera.en = "A conflicting 85mm camera";
    const plan = t.parseDirectorPlan(x, 10, true);
    assert.equal(plan.slots.camera.en, t.rigPrompt(plan.rig).en);
    assert(!plan.slots.camera.en.includes("85mm"));
    assert(plan.advice.camera.zh.length > 10);
    for (const invalid of [
      { ...directorFixture(), rig: { ...t.defaultRig(), body: "unsupported-camera" } },
      { ...directorFixture(), advice: { camera: { zh: "x", en: "x" } } },
      { ...directorFixture(), extra: 1 },
    ])
      assert.throws(() => t.parseDirectorPlan(invalid, 10, true));
  });
  check("director honors locked camera and rejects wrong duration atomically", () => {
    const x = directorFixture(),
      locked = { ...t.defaultRig(), body: "fx3" };
    assert.throws(() => t.parseDirectorPlan(x, 10, true, locked));
    x.rig = locked;
    assert.equal(t.parseDirectorPlan(x, 10, true, locked).rig.body, "fx3");
    assert.throws(() => t.parseDirectorPlan(x, 9, true));
  });
  await asyncCheck(
    "one director request returns all slots, rig, timeline and reasons without overwriting draft",
    async () => {
      t.loadExample("cat");
      t.state.ui.lockRig = false;
      const before = JSON.stringify(t.state.draft);
      let body;
      context.fetch = async (url, opts) => {
        body = JSON.parse(opts.body);
        return response({ choices: [{ message: { content: JSON.stringify(directorFixture()) } }] });
      };
      await t.expand("director");
      assert.equal(JSON.stringify(t.state.draft), before);
      assert(t.state.proposal);
      assert(body.messages[0].content.includes("storyboard director"));
      assert.equal(JSON.parse(body.messages[1].content).camera_constraints, null);
      assert(JSON.parse(body.messages[1].content).current_slots.subject.en.includes("amber eyes"));
      assert.equal(t.state.proposal.plan.timeline.segments.length, 6);
      assert(storage.get("vps.studio.v1").includes("proposal"));
    },
  );
  check("pending director proposal survives allowlisted local serialization", () => {
    const restored = t.cleanProposal(json(t.state.proposal));
    assert(restored);
    assert.equal(restored.plan.rig.body, "alexa35");
    assert.equal(restored.signature, t.directorSignature());
    assert.equal(t.cleanProposal({ ...json(t.state.proposal), plan: {} }), null);
  });
  check("applying only camera preserves subject and timeline and leaves the rest available", () => {
    const subject = json(t.state.draft.slots.subject),
      timeline = json(t.state.draft.timeline);
    t.acceptDirector("camera");
    assert.equal(t.state.draft.rig.body, "alexa35");
    assert.deepEqual(json(t.state.draft.slots.subject), subject);
    assert.deepEqual(json(t.state.draft.timeline), timeline);
    assert(t.state.proposal.accepted.camera);
    assert.equal(t.state.proposal.signature, t.directorSignature());
    assert(t.state.draft.guidance.camera);
    assert.equal(t.state.draft.guidance.timeline, null);
  });
  check("applying only timeline keeps camera and six-slot subject", () => {
    const camera = json(t.state.draft.slots.camera),
      subject = json(t.state.draft.slots.subject);
    t.acceptDirector("timeline");
    assert.deepEqual(json(t.state.draft.slots.camera), camera);
    assert.deepEqual(json(t.state.draft.slots.subject), subject);
    assert.equal(t.state.draft.timeline.enabled, true);
    assert(t.state.proposal.accepted.timeline);
    assert(t.state.draft.guidance.timeline);
  });
  check("applying whole director plan synchronizes camera, six slots and timing and saves history", () => {
    const original = json(t.state.draft);
    t.acceptDirector("all");
    assert.equal(t.state.proposal, null);
    assert.equal(t.state.draft.rig.body, "alexa35");
    assert.equal(t.state.draft.slots.camera.en, t.rigPrompt(t.state.draft.rig).en);
    assert.equal(t.state.draft.slots.subject.zh, t.EXAMPLES.boat.subject[0]);
    assert.equal(t.timelineIssues(t.state.draft.timeline, "en").length, 0);
    assert(t.state.history.some((x) => x.slots.subject.en === original.slots.subject.en));
    assert(t.state.history.some((x) => x.guidance?.camera && x.guidance?.timeline));
  });
  await asyncCheck("stale director suggestions cannot overwrite a later edit", async () => {
    context.fetch = async () =>
      response({ choices: [{ message: { content: JSON.stringify(directorFixture()) } }] });
    await t.expand("director");
    assert(t.state.proposal);
    t.state.draft.idea += " user edit";
    const before = JSON.stringify(t.state.draft);
    t.acceptDirector("all");
    assert.equal(JSON.stringify(t.state.draft), before);
    assert(t.state.proposal);
  });
  await asyncCheck("invalid director response preserves draft and previous suggestion", async () => {
    const before = JSON.stringify(t.state.draft),
      previous = JSON.stringify(t.state.proposal);
    const x = directorFixture();
    x.timeline.segments[1].start = 1;
    context.fetch = async () => response({ choices: [{ message: { content: JSON.stringify(x) } }] });
    await t.expand("director");
    assert.equal(JSON.stringify(t.state.draft), before);
    assert.equal(JSON.stringify(t.state.proposal), previous);
  });
  await asyncCheck(
    "director request includes explicit camera lock and rejects disobedient choices",
    async () => {
      t.state.ui.lockRig = true;
      t.state.draft.rig = { ...t.defaultRig(), body: "fx3" };
      let sent;
      context.fetch = async (url, opts) => {
        sent = JSON.parse(JSON.parse(opts.body).messages[1].content);
        return response({ choices: [{ message: { content: JSON.stringify(directorFixture()) } }] });
      };
      const before = JSON.stringify(t.state.draft);
      await t.expand("director");
      assert.equal(sent.camera_constraints.body, "fx3");
      assert.equal(JSON.stringify(t.state.draft), before);
      assert($("aiStatus").textContent.includes("未遵守"));
      t.state.ui.lockRig = false;
    },
  );
  await asyncCheck("in-flight director request preserves edits and returns to idle", async () => {
    const before = JSON.stringify(t.state.draft);
    context.fetch = async () => {
      t.edit();
      return response({ choices: [{ message: { content: JSON.stringify(directorFixture()) } }] });
    };
    await t.expand("director");
    assert.equal(JSON.stringify(t.state.draft), before);
    assert.equal(t.busy, false);
    assert.equal($("directorBtn").disabled, false);
  });
  check("guidance backup is sanitized and excludes pending proposal metadata", () => {
    t.state.draft.guidance = {
      camera: { zh: "参考 FAKE_API_SECRET_123", en: "Reference FAKE_GITHUB_SECRET_456" },
      timeline: null,
    };
    t.saveHistory(false);
    const data = t.backupPayload(),
      text = JSON.stringify(data);
    assert(!text.includes("FAKE_API_SECRET_123"));
    assert(!text.includes("FAKE_GITHUB_SECRET_456"));
    assert(!Object.hasOwn(data, "proposal"));
    assert(data.history.some((x) => x.guidance.camera));
  });
  if (process.env.VPS_QA_FIXTURE)
    fs.writeFileSync(process.env.VPS_QA_FIXTURE, JSON.stringify(directorFixture(), null, 2));
  const humanFixture = (reviewed = false) => {
    const e = t.HUMAN_EXAMPLE,
      slots = Object.fromEntries(
        t.SLOT_KEYS.map((k) => [
          k,
          k === "negative"
            ? { zh: "面部变化，肢体畸形", en: t.DEFAULT_NEG }
            : k === "camera"
              ? t.rigPrompt(e.rig)
              : { zh: e[k][0], en: e[k][1] },
        ]),
      );
    const human = json(t.humanExamplePlan());
    if (reviewed)
      human.review = {
        zh: "文本复核：杯底获得桌面支撑后才松手，双手收稳后再转向窗外，杯子始终留在桌面。",
        en: "Text review: release follows table support; gaze shifts after both hands settle, while the cup remains on the table.",
      };
    return {
      slots,
      rig: json(e.rig),
      timeline: { duration: 10, continuous: true, segments: json(e.timeline.segments) },
      advice: {
        camera: {
          zh: "平视固定中景同时保留脸、双手与桌面，避免复杂运镜增加动作衔接负担。",
          en: "A locked eye-level medium view keeps face, hands and table visible without adding complex camera motion.",
        },
        timeline: {
          zh: "以放稳杯子为一个核心任务，按确认落点、移动、支撑交接、收手、转移注意五段安排。",
          en: "One core cup-setting task unfolds through locating the spot, moving, support transfer, withdrawing and shifting attention.",
        },
      },
      human,
    };
  };
  check("human detection covers common nouns and pronouns without matching 其他", () => {
    for (const s of [
      "一个男生在跑步",
      "他走进房间",
      "妈妈抱着孩子",
      "一位老师在讲课",
      "Two women talk",
      "He walks in",
      "A child plays",
    ])
      assert.equal(t.performanceContext({ idea: s }).required, true, s);
    for (const s of ["其他车辆驶过", "A cat sleeps", "雨夜的街道"])
      assert.equal(t.performanceContext({ idea: s }).required, false, s);
  });
  check("human detection supports explicit mode, nouns and general override", () => {
    assert.equal(t.performanceContext({ idea: "一个女人坐在窗边" }).required, true);
    assert.equal(t.performanceContext({ idea: "A woman sets a cup down" }).required, true);
    assert.equal(t.performanceContext({ idea: "橘猫在屋檐下避雨" }).required, false);
    assert.equal(
      t.performanceContext({ idea: "一个女人", performance: { mode: "general" } }).required,
      false,
    );
    assert.equal(t.performanceContext({ idea: "小明", performance: { mode: "human" } }).required, true);
  });
  check("human preset contains purpose, support transfer and a one-to-one causal timeline", () => {
    t.loadExample("human");
    assert.equal(t.state.draft.rig.movement, "locked");
    assert.equal(t.state.draft.timeline.segments.length, 5);
    assert.equal(t.humanCurrent(t.state.draft), true);
    assert.equal(t.state.draft.humanPlan.logic.length, 5);
    assert.equal(t.state.draft.humanPlan.review, null);
    assert(t.outputFor("zh").positive.includes("人物与空间连续性"));
    assert(t.outputFor("en").positive.includes("Character and spatial continuity"));
  });
  check("human export keeps identity once and excludes the review-only causal chart", () => {
    const out = t.outputFor("en").positive,
      identity = t.state.draft.humanPlan.identity.en;
    assert.equal(out.split(identity).length - 1, 1);
    assert(!out.includes(t.state.draft.humanPlan.logic[0].cause.en));
  });
  check("human plan validation rejects missing sheet, misaligned beats and missing review", () => {
    const x = humanFixture();
    assert.throws(() => t.parseDirectorPlan({ ...x, human: null }, 10, true, null, true));
    const bad = json(x);
    bad.human.logic[1].start = 1;
    assert.throws(() => t.parseDirectorPlan(bad, 10, true, null, true));
    assert.throws(() => t.parseDirectorPlan(x, 10, true, null, true, true));
    assert(t.parseDirectorPlan(humanFixture(true), 10, true, null, true, true).human.review);
  });
  await asyncCheck(
    "human director performs generation then causal review before presenting a suggestion",
    async () => {
      const before = JSON.stringify(t.state.draft),
        requests = [];
      context.fetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        requests.push(body);
        return response({
          choices: [{ message: { content: JSON.stringify(humanFixture(requests.length === 2)) } }],
        });
      };
      await t.expand("director");
      assert.equal(requests.length, 2);
      assert(requests[1].messages[0].content.startsWith("HUMAN_REVIEW_PASS"));
      assert(JSON.parse(requests[0].messages[1].content).performance.required);
      assert(t.state.proposal.plan.human.review);
      assert.equal(JSON.stringify(t.state.draft), before);
    },
  );
  check("adopting a human plan stores identity, causal chain and basis in draft and history", () => {
    t.acceptDirector("all");
    assert(t.state.draft.humanPlan.review);
    assert(t.humanCurrent(t.state.draft));
    assert(t.state.history.some((x) => x.humanPlan?.review));
    const copy = t.cleanDraft(json(t.state.draft));
    assert(t.humanCurrent(copy));
  });
  check("manual changes invalidate added human continuity text without discarding edited content", () => {
    t.state.draft.timeline.segments[0].en = "A deliberately changed human action";
    assert(!t.humanCurrent(t.state.draft));
    const out = t.outputFor("en");
    assert(!out.positive.includes("Character and spatial continuity"));
    assert(out.positive.includes("A deliberately changed human action"));
    t.loadExample("human");
  });
  await asyncCheck("failed second pass preserves draft and any previous proposal atomically", async () => {
    const before = JSON.stringify(t.state.draft),
      previous = JSON.stringify(t.state.proposal);
    let calls = 0;
    context.fetch = async () => {
      calls++;
      if (calls === 2) throw new TypeError("Failed to fetch");
      return response({ choices: [{ message: { content: JSON.stringify(humanFixture()) } }] });
    };
    await t.expand("director");
    assert.equal(calls, 2);
    assert.equal(JSON.stringify(t.state.draft), before);
    assert.equal(JSON.stringify(t.state.proposal), previous);
    assert.equal(t.busy, false);
  });
  await asyncCheck(
    "second pass without review notes is rejected instead of claiming completed review",
    async () => {
      const before = JSON.stringify(t.state.draft);
      let calls = 0;
      context.fetch = async () => {
        calls++;
        return response({ choices: [{ message: { content: JSON.stringify(humanFixture()) } }] });
      };
      await t.expand("director");
      assert.equal(calls, 3);
      assert.equal(JSON.stringify(t.state.draft), before);
      assert($("aiStatus").textContent.includes("缺少行为逻辑复核"));
    },
  );
  await asyncCheck("edits during human review prevent late candidate replacement", async () => {
    const previous = JSON.stringify(t.state.proposal);
    let calls = 0;
    context.fetch = async () => {
      calls++;
      if (calls === 2) {
        t.state.draft.idea += " changed during review";
        t.edit();
      }
      return response({ choices: [{ message: { content: JSON.stringify(humanFixture(calls === 2)) } }] });
    };
    await t.expand("director");
    assert.equal(calls, 2);
    assert(t.state.draft.idea.endsWith("changed during review"));
    assert.equal(JSON.stringify(t.state.proposal), previous);
    t.loadExample("human");
  });
  await asyncCheck(
    "missing human data in forced human mode is rejected (after one repair) without a review request",
    async () => {
      let calls = 0;
      context.fetch = async (url, opts) => {
        calls++;
        assert(!JSON.parse(opts.body).messages[0].content.startsWith("HUMAN_REVIEW_PASS"));
        return response({ choices: [{ message: { content: JSON.stringify(directorFixture()) } }] });
      };
      await t.expand("director");
      assert.equal(calls, 2);
      assert($("aiStatus").textContent.includes("缺少身份"));
    },
  );
  await asyncCheck("a cancelled human review leaves data intact and restores controls", async () => {
    const before = JSON.stringify(t.state.draft);
    let calls = 0;
    context.fetch = async () => {
      calls++;
      if (calls === 2) {
        const e = new Error("cancel");
        e.name = "AbortError";
        throw e;
      }
      return response({ choices: [{ message: { content: JSON.stringify(humanFixture()) } }] });
    };
    await t.expand("director");
    assert.equal(JSON.stringify(t.state.draft), before);
    assert.equal($("directorBtn").disabled, false);
    assert($("aiStatus").textContent.includes("取消"));
  });
  check("cached human proposals require completed text review and aligned timing", () => {
    const raw = humanFixture(),
      proposal = {
        plan: raw,
        duration: 10,
        continuous: true,
        lockedRig: null,
        signature: t.directorSignature(),
        createdAt: new Date().toISOString(),
      };
    assert.equal(t.cleanProposal(proposal), null);
    proposal.plan = humanFixture(true);
    assert(t.cleanProposal(proposal));
    t.loadExample("human");
    t.state.draft.humanPlan.logic[0].end = 1;
    assert(!t.humanCurrent(t.state.draft));
    t.loadExample("human");
  });
  await asyncCheck(
    "human review keeps the same requested model if settings change during first pass",
    async () => {
      const original = t.credentials.apiModel,
        models = [];
      context.fetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        models.push(body.model);
        if (models.length === 1) t.credentials.apiModel = "changed-after-request";
        return response({
          choices: [{ message: { content: JSON.stringify(humanFixture(models.length === 2)) } }],
        });
      };
      await t.expand("director");
      assert.equal(models.length, 2);
      assert.equal(models[0], models[1]);
      t.credentials.apiModel = original;
    },
  );
  check("legacy full-JSON human basis remains current; audio edits do not stale the plan", () => {
    t.loadExample("human");
    t.state.draft.humanBasis = t.humanBasisJSON(t.state.draft);
    assert(t.humanCurrent(t.state.draft));
    t.state.draft.slots.audio.en = "Different audio";
    assert(t.humanCurrent(t.state.draft));
    t.state.draft.slots.subject.en += " changed";
    assert(!t.humanCurrent(t.state.draft));
    t.loadExample("human");
    assert(t.state.draft.humanBasis.startsWith("h1:"));
    assert(t.state.draft.humanBasis.length < 40);
  });
  check("human context is allowlisted and secret values are redacted from backup", () => {
    t.state.draft.performance.identity += " FAKE_API_SECRET_123";
    t.state.draft.humanPlan.continuity.en += " FAKE_GITHUB_SECRET_456";
    t.state.draft.humanBasis = t.humanBasis(t.state.draft);
    t.saveHistory(false);
    const data = t.backupPayload(),
      text = JSON.stringify(data);
    assert(!text.includes("FAKE_API_SECRET_123"));
    assert(!text.includes("FAKE_GITHUB_SECRET_456"));
    assert(data.history.some((x) => x.humanPlan));
  });
  if (process.env.VPS_HUMAN_FIXTURE)
    fs.writeFileSync(process.env.VPS_HUMAN_FIXTURE, JSON.stringify(humanFixture(true), null, 2));
  await asyncCheck("Gist POST creates secret backup, excludes keys, persists returned ID", async () => {
    t.settingsToForm();
    let request;
    context.fetch = async (url, opts) => {
      request = { url, ...opts };
      return response({ id: "abcdef1234567890" });
    };
    await t.syncGist();
    assert.equal(request.method, "POST");
    const body = JSON.parse(request.body);
    assert.equal(body.public, false);
    assert(body.files.video_prompts_backup === undefined);
    const content = body.files["video_prompts_backup.json"].content;
    assert(!content.includes("FAKE_API_SECRET_123"));
    assert(!content.includes("FAKE_GITHUB_SECRET_456"));
    assert.equal(t.credentials.gistId, "abcdef1234567890");
    assert.equal(JSON.parse(storage.get("vps.credentials.v1")).gistId, "abcdef1234567890");
  });
  await asyncCheck("Gist PATCH updates the configured ID", async () => {
    t.settingsToForm();
    let request;
    context.fetch = async (url, opts) => {
      request = { url, ...opts };
      return response({ id: t.credentials.gistId });
    };
    await t.syncGist();
    assert.equal(request.method, "PATCH");
    assert(request.url.endsWith("/abcdef1234567890"));
    assert.equal(JSON.parse(request.body).public, undefined);
  });
  await asyncCheck("Gist GET merges valid backup and rejects truncated files", async () => {
    t.settingsToForm();
    const data = json(t.backupPayload());
    data.history = [{ ...data.history[0], id: "downloaded-remote" }];
    context.fetch = async () =>
      response({ files: { "video_prompts_backup.json": { content: JSON.stringify(data) } } });
    await t.syncGist(true);
    assert(t.state.history.some((v) => v.id === "downloaded-remote"));
    const before = JSON.stringify(t.state);
    context.fetch = async () =>
      response({ files: { "video_prompts_backup.json": { truncated: true, content: "{}" } } });
    await t.syncGist(true);
    assert.equal(JSON.stringify(t.state), before);
    assert($("syncStatus").textContent.includes("截断"));
  });
  await asyncCheck("HTTP authentication errors are actionable without leaking response text", async () => {
    context.fetch = async () => ({ ok: false, status: 401 });
    await assert.rejects(t.fetchJSON("https://example.com"), /认证失败/);
  });
  check("CDN script is pinned with subresource integrity", () => {
    assert(
      /lucide@0\.468\.0[^>]*integrity="sha384-[A-Za-z0-9+/=]{64}"[^>]*crossorigin="anonymous"/.test(html),
    );
  });
  for (const timer of timers) clearTimeout(timer);
  console.log(`\n${count} checks passed. No live APIs or credentials used.`);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
