/**
 * Minimal runner for object-specific geometry assertions. Keep measurements
 * beside the generator that owns their dimensions; use this module only for
 * consistent reporting and failure behavior.
 */

function normalizeCheck(check, index) {
  if (!check || typeof check.measure !== "function" || typeof check.accept !== "function") {
    throw new TypeError(`geometry contract check ${index} needs measure() and accept()`);
  }
  const severity = check.severity ?? "error";
  if (severity !== "error" && severity !== "warning") throw new TypeError(`geometry contract check ${index} severity must be "error" or "warning"`);
  return {
    id: check.id ?? `check-${index}`,
    label: check.label ?? check.id ?? `check ${index}`,
    severity,
    expected: check.expected ?? "custom predicate",
    measure: check.measure,
    accept: check.accept,
  };
}

export function runGeometryContract(contract, context) {
  const name = contract?.name ?? "geometry";
  const checks = (contract?.checks ?? []).map(normalizeCheck);
  const ids = new Set();
  for (const check of checks) {
    if (ids.has(check.id)) throw new TypeError(`geometry contract "${name}" has duplicate check id "${check.id}"`);
    ids.add(check.id);
  }
  const results = [];
  for (const check of checks) {
    try {
      const value = check.measure(context);
      results.push({
        id: check.id,
        label: check.label,
        severity: check.severity,
        expected: check.expected,
        value,
        ok: check.accept(value, context) === true,
      });
    } catch (error) {
      results.push({
        id: check.id,
        label: check.label,
        severity: check.severity,
        expected: check.expected,
        value: undefined,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const failures = results.filter((result) => !result.ok && result.severity !== "warning");
  const warnings = results.filter((result) => !result.ok && result.severity === "warning");
  return { name, ok: failures.length === 0, failures, warnings, results };
}

export function assertGeometryContract(report) {
  if (report.ok) return report;
  const printable = (value) => {
    try {
      const json = JSON.stringify(value);
      return json === undefined ? String(value) : json;
    } catch {
      return String(value);
    }
  };
  const detail = report.failures
    .map((result) => `${result.id}: got ${printable(result.value)}, expected ${result.expected}${result.error ? ` (${result.error})` : ""}`)
    .join("\n- ");
  throw new Error(`${report.name} failed geometry contract:\n- ${detail}`);
}

export function rangeCheck(id, measure, min, max, options = {}) {
  return {
    id,
    label: options.label ?? id,
    severity: options.severity,
    expected: `${min} <= value <= ${max}`,
    measure,
    accept: (value) => Number.isFinite(value) && value >= min && value <= max,
  };
}

export function minimumCheck(id, measure, min, options = {}) {
  return {
    id,
    label: options.label ?? id,
    severity: options.severity,
    expected: `value >= ${min}`,
    measure,
    accept: (value) => Number.isFinite(value) && value >= min,
  };
}

export function maximumCheck(id, measure, max, options = {}) {
  return {
    id,
    label: options.label ?? id,
    severity: options.severity,
    expected: `value <= ${max}`,
    measure,
    accept: (value) => Number.isFinite(value) && value <= max,
  };
}

export function nearCheck(id, measure, target, tolerance, options = {}) {
  return {
    id,
    label: options.label ?? id,
    severity: options.severity,
    expected: `|value - ${target}| <= ${tolerance}`,
    measure,
    accept: (value) => Number.isFinite(value) && Math.abs(value - target) <= tolerance,
  };
}

export function predicateCheck(id, measure, accept, expected, options = {}) {
  return { id, label: options.label ?? id, severity: options.severity, expected, measure, accept };
}

export function intervalOverlap(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function boundsIntersectionDepth(a, b) {
  return [
    intervalOverlap(a.min.x, a.max.x, b.min.x, b.max.x),
    intervalOverlap(a.min.y, a.max.y, b.min.y, b.max.y),
    intervalOverlap(a.min.z, a.max.z, b.min.z, b.max.z),
  ];
}

export function boundsGapAlongAxis(a, b, axis) {
  if (a.max[axis] < b.min[axis]) return b.min[axis] - a.max[axis];
  if (b.max[axis] < a.min[axis]) return a.min[axis] - b.max[axis];
  return 0;
}

export function boundsContains(outer, inner, tolerance = 0) {
  return inner.min.x >= outer.min.x - tolerance && inner.max.x <= outer.max.x + tolerance &&
    inner.min.y >= outer.min.y - tolerance && inner.max.y <= outer.max.y + tolerance &&
    inner.min.z >= outer.min.z - tolerance && inner.max.z <= outer.max.z + tolerance;
}
