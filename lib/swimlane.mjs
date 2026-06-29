// Swimlane reader + structural validator — the ONE place that parses and checks a
// `## Workflow` swimlane block. Zero-dependency and pure (no I/O, no other-file imports), so
// it is trivially testable and reusable by the loader, validator, guard, and renderer.
//
// A swimlane is a Trembus `@trembus/ui` Swimlane contract: `{ caption?, lanes[], steps[] }`.
//   lane : { id?, label (required), kind? ∈ human·ai·system·tool·neutral }
//   step : { id?, lane (required), label (required), col?, status?, detail?, note?, to?[] }
//
// The engine invents no workflow semantics; it only checks that the block is internally
// coherent — required fields present, ids unique, and every `lane`/`to[]` reference resolves —
// so the renderer can lay it out and a guard can block a write that would break it.

// Defaults match the `@trembus/ui` Swimlane vocabulary; a project can widen the lane kinds
// via config (swimlaneLaneKinds). Step status is the kit's fixed enum.
const DEFAULT_LANE_KINDS = new Set(["human", "ai", "system", "tool", "neutral"]);
const STEP_STATUSES = new Set(["done", "active", "pending", "blocked", "skipped"]);

// Extract a single fenced ```json block out of a body section string. The ONE fence reader —
// the Workflow, Runs, and Phases facets all go through it (single source, no second parser).
// Returns { value } on success, { error } to warn on, or null when no block is present.
export function fencedJson(sectionText) {
  if (!sectionText) return null;
  const m = sectionText.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (!m) return null;
  try {
    return { value: JSON.parse(m[1]) };
  } catch (e) {
    return { error: `invalid JSON (${e.message})` };
  }
}

// Validate a parsed swimlane contract. Pure. Returns issues: { severity, code, message, path }.
//   contract     : the JSON.parse'd { caption?, lanes[], steps[] } (or anything)
//   opts.severity: severity for HARD referential issues ("error" | "warning"); advisory issues
//                  (unknown kind/status, bad col, reachability) are always "warning".
//   opts.laneKinds: Set of allowed lane.kind values (advisory). Defaults to the kit vocabulary.
export function validateSwimlane(contract, opts = {}) {
  const sev = opts.severity === "warning" ? "warning" : "error";
  const laneKinds = opts.laneKinds instanceof Set ? opts.laneKinds : DEFAULT_LANE_KINDS;
  const issues = [];
  const push = (severity, code, message, path) => issues.push({ severity, code, message, path });

  // 1 — shape: needs lanes[] and steps[]. Nothing else is checkable without them.
  const lanes = contract && typeof contract === "object" ? contract.lanes : undefined;
  const steps = contract && typeof contract === "object" ? contract.steps : undefined;
  if (!Array.isArray(lanes) || !Array.isArray(steps)) {
    push(sev, "swimlane.shape", "needs lanes[] and steps[] arrays");
    return issues;
  }

  // lanes — collect resolvable ids + labels for step.lane resolution.
  const laneIds = new Set();
  const laneLabels = new Set();
  lanes.forEach((lane, i) => {
    const at = `lanes[${i}]`;
    if (!lane || typeof lane !== "object" || Array.isArray(lane)) {
      push(sev, "swimlane.lane.shape", "lane must be an object", at);
      return;
    }
    if (typeof lane.label !== "string" || !lane.label.trim()) {
      push(sev, "swimlane.lane.label", "lane needs a non-empty label", `${at}.label`);
    } else {
      laneLabels.add(lane.label);
    }
    if (lane.id !== undefined) {
      if (typeof lane.id !== "string" || !lane.id.trim()) {
        push(sev, "swimlane.lane.id", "lane id must be a non-empty string", `${at}.id`);
      } else if (laneIds.has(lane.id)) {
        push(sev, "swimlane.lane.dupId", `duplicate lane id "${lane.id}"`, `${at}.id`);
      } else {
        laneIds.add(lane.id);
      }
    }
    if (lane.kind !== undefined && !laneKinds.has(lane.kind)) {
      push("warning", "swimlane.lane.kind", `unknown lane kind "${lane.kind}" (known: ${[...laneKinds].join(", ")})`, `${at}.kind`);
    }
  });

  // First pass over steps: collect ids, flag duplicates.
  const stepIds = new Set();
  const dupStepIds = new Set();
  for (const step of steps) {
    if (step && typeof step === "object" && typeof step.id === "string" && step.id.trim()) {
      if (stepIds.has(step.id)) dupStepIds.add(step.id);
      else stepIds.add(step.id);
    }
  }
  const laneResolves = (ref) => laneIds.has(ref) || laneLabels.has(ref);

  // Second pass: per-step checks.
  steps.forEach((step, i) => {
    const at = `steps[${i}]`;
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      push(sev, "swimlane.step.shape", "step must be an object", at);
      return;
    }
    if (typeof step.lane !== "string" || !step.lane.trim()) {
      push(sev, "swimlane.step.required", "step needs a non-empty lane", `${at}.lane`);
    } else if (!laneResolves(step.lane)) {
      push(sev, "swimlane.step.laneRef", `step lane "${step.lane}" matches no lane id or label`, `${at}.lane`);
    }
    if (typeof step.label !== "string" || !step.label.trim()) {
      push(sev, "swimlane.step.required", "step needs a non-empty label", `${at}.label`);
    }
    if (typeof step.id === "string" && dupStepIds.has(step.id)) {
      push(sev, "swimlane.step.dupId", `duplicate step id "${step.id}"`, `${at}.id`);
    }
    if (step.status !== undefined && !STEP_STATUSES.has(step.status)) {
      push("warning", "swimlane.step.status", `unknown step status "${step.status}" (known: ${[...STEP_STATUSES].join(", ")})`, `${at}.status`);
    }
    if (step.col !== undefined && (!Number.isInteger(step.col) || step.col < 0)) {
      push("warning", "swimlane.step.col", "col must be a non-negative integer", `${at}.col`);
    }
    if (step.to !== undefined) {
      if (!Array.isArray(step.to)) {
        push(sev, "swimlane.step.to", "to must be an array of step ids", `${at}.to`);
      } else {
        step.to.forEach((t, j) => {
          if (typeof t !== "string" || !stepIds.has(t)) {
            push(sev, "swimlane.step.toRef", `to[${j}] "${t}" matches no step id`, `${at}.to[${j}]`);
          }
        });
      }
    }
  });

  // Reachability (advisory, multi-start aware) — only meaningful with ids + more than one step.
  if (steps.length > 1 && stepIds.size) {
    const idOf = (s) => (s && typeof s === "object" && typeof s.id === "string" && stepIds.has(s.id) ? s.id : null);
    const byId = new Map();
    for (const s of steps) { const id = idOf(s); if (id && !byId.has(id)) byId.set(id, s); }
    const incoming = new Set();
    for (const s of steps) if (s && Array.isArray(s.to)) for (const t of s.to) if (stepIds.has(t)) incoming.add(t);
    const entries = [...byId.keys()].filter((id) => !incoming.has(id));
    const seen = new Set(entries);
    const queue = [...entries];
    while (queue.length) {
      const cur = byId.get(queue.shift());
      if (cur && Array.isArray(cur.to)) for (const t of cur.to) if (stepIds.has(t) && !seen.has(t)) { seen.add(t); queue.push(t); }
    }
    for (const id of byId.keys()) {
      if (!seen.has(id)) push("warning", "swimlane.reachability", `step "${id}" is unreachable (no path from an entry step)`);
    }
    // A flow where every step hands off (no empty/absent to[]) has no exit — likely a typo.
    const hasTerminal = steps.some((s) => s && typeof s === "object" && (s.to === undefined || (Array.isArray(s.to) && s.to.length === 0)));
    if (!hasTerminal && entries.length) {
      push("warning", "swimlane.noTerminal", "no terminal step (every step hands off; expected at least one with an empty to[])");
    }
  }

  return issues;
}

// --- self-test: pin the rule semantics (pure, no fixtures) -------------------
function selfTest() {
  const valid = {
    caption: "x",
    lanes: [
      { id: "you", label: "You", kind: "human" },
      { id: "sys", label: "System", kind: "system" },
    ],
    steps: [
      { id: "a", lane: "you", label: "A", status: "done", to: ["b"] },
      { id: "b", lane: "sys", label: "B", status: "active", note: "n", to: [] },
    ],
  };
  const errs = (c, o) => validateSwimlane(c, { severity: "error", ...o }).filter((i) => i.severity === "error");
  const warns = (c, o) => validateSwimlane(c, { severity: "error", ...o }).filter((i) => i.severity === "warning");
  const clone = (mut) => { const c = JSON.parse(JSON.stringify(valid)); mut(c); return c; };

  const cases = [
    ["valid swimlane → 0 issues", () => validateSwimlane(valid, { severity: "error" }).length === 0],
    ["missing lanes[]/steps[] → shape error", () => errs({}).some((i) => i.code === "swimlane.shape")],
    ["lane missing label → error", () => errs(clone((c) => { delete c.lanes[0].label; })).some((i) => i.code === "swimlane.lane.label")],
    ["duplicate lane id → error", () => errs(clone((c) => { c.lanes[1].id = "you"; })).some((i) => i.code === "swimlane.lane.dupId")],
    ["duplicate step id → error", () => errs(clone((c) => { c.steps[1].id = "a"; })).some((i) => i.code === "swimlane.step.dupId")],
    ["step.lane unresolved → error", () => errs(clone((c) => { c.steps[0].lane = "ghost"; })).some((i) => i.code === "swimlane.step.laneRef")],
    ["dangling step.to → error (headline)", () => errs(clone((c) => { c.steps[0].to = ["nope"]; })).some((i) => i.code === "swimlane.step.toRef")],
    ["step missing lane+label → error", () => errs(clone((c) => { c.steps.push({ id: "c" }); })).some((i) => i.code === "swimlane.step.required")],
    ["unknown lane.kind → warning, not error", () => { const c = clone((x) => { x.lanes[0].kind = "robot"; }); return warns(c).some((i) => i.code === "swimlane.lane.kind") && !errs(c).length; }],
    ["unknown step.status → warning", () => warns(clone((c) => { c.steps[0].status = "spinning"; })).some((i) => i.code === "swimlane.step.status")],
    ["bad col → warning", () => warns(clone((c) => { c.steps[0].col = -1; })).some((i) => i.code === "swimlane.step.col")],
    ["unreachable step (disconnected cycle) → warning, not error", () => { const c = { lanes: [{ id: "l", label: "L" }], steps: [{ id: "a", lane: "l", label: "A", to: [] }, { id: "b", lane: "l", label: "B", to: ["c"] }, { id: "c", lane: "l", label: "C", to: ["b"] }] }; return warns(c).some((i) => i.code === "swimlane.reachability") && !errs(c).length; }],
    ["lane resolved by label (no ids) → 0 errors", () => errs({ lanes: [{ label: "You", kind: "human" }], steps: [{ id: "a", lane: "You", label: "A", to: [] }] }).length === 0],
    ["configurable lane kinds: extra kind accepted", () => warns(clone((c) => { c.lanes[0].kind = "robot"; }), { laneKinds: new Set(["human", "system", "robot"]) }).every((i) => i.code !== "swimlane.lane.kind")],
    ["no-terminal (entry + exitless cycle) → warning", () => warns({ lanes: [{ id: "l", label: "L" }], steps: [{ id: "a", lane: "l", label: "A", to: ["b"] }, { id: "b", lane: "l", label: "B", to: ["c"] }, { id: "c", lane: "l", label: "C", to: ["b"] }] }).some((i) => i.code === "swimlane.noTerminal")],
  ];

  let pass = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try { ok = fn(); } catch { ok = false; }
    console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
    if (ok) pass += 1;
  }
  console.log(`self-test: ${pass}/${cases.length} passed`);
  return pass === cases.length;
}

if (process.argv[1] && process.argv[1].endsWith("swimlane.mjs") && process.argv.includes("--self-test")) {
  process.exit(selfTest() ? 0 : 1);
}
