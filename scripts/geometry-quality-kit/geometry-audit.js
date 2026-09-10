/**
 * Copyable world-space quality gate for a built Three.js Object3D hierarchy.
 *
 * Audit named parts before material merging, then audit the merged result too.
 * Coplanar detection uses all sixteen neighboring cells of a four-dimensional
 * plane grid and measures clipped triangle overlap, not bounding-box overlap.
 * Clash detection requires real triangle crossings after a scale-aware shared-
 * volume test. Default tolerances assume metres.
 */
const ANG = 25e-4;
const DIST = 15e-4;
const OVERLAP_A = 2e-4;
const CELL_N = 0.02;
const CELL_D = 0.02;
const CLASH_DEPTH = 0.03;
function qualifiedName(o) {
  const parts = [];
  let cur = o;
  while (cur) {
    if (cur.name) parts.unshift(cur.name);
    cur = cur.parent;
  }
  if (parts.length === 0) return `${o.type}#${o.id}`;
  return parts.join("/");
}
const GEOMETRY_AUDIT_DEFAULTS = Object.freeze({
  angleRadians: ANG,
  planeDistance: DIST,
  overlapArea: OVERLAP_A,
  planeCellNormal: CELL_N,
  planeCellDistance: CELL_D,
  clashDepth: CLASH_DEPTH,
  clashCellSize: 0.4,
  maxCellsPerTriangle: 256,
  minimumClashCrossings: 3,
  normalLengthTolerance: 1e-3,
  maxTriangles: 6e5,
  unit: "metre"
});
const DEFAULT_BOUNDS = null;
function multiplyMatrixElements(a, b, offset = 0) {
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out[column * 4 + row] =
        a[row] * b[offset + column * 4] +
        a[4 + row] * b[offset + column * 4 + 1] +
        a[8 + row] * b[offset + column * 4 + 2] +
        a[12 + row] * b[offset + column * 4 + 3];
    }
  }
  return out;
}
function worldTransforms(o, name, instanced) {
  if (!instanced) return [{ name, matrix: o.matrixWorld.elements }];
  const array = o.instanceMatrix?.array;
  const capacity = Math.floor((array?.length ?? 0) / 16);
  const count = Math.min(capacity, Math.max(0, Math.floor(o.count ?? 0)));
  if (!array || count === 0) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      name: `${name}[${i}]`,
      matrix: multiplyMatrixElements(o.matrixWorld.elements, array, i * 16)
    });
  }
  return out;
}
function collect(root, opts) {
  const minArea = opts.minArea ?? opts.overlapArea;
  const bounds = opts.bounds === void 0 ? DEFAULT_BOUNDS : opts.bounds;
  const cx = bounds?.centerX ?? 0;
  const cz = bounds?.centerZ ?? 0;
  const r2 = bounds ? bounds.radius * bounds.radius : 0;
  const names = [];
  const defects = [];
  const noMaterial = [];
  const pos = [];
  const nrm = [];
  const dist = [];
  const area = [];
  const box = [];
  const mesh = [];
  const meshBoxes = [];
  let total = 0;
  root.updateMatrixWorld(true);
  const visit = (node) => {
    const flags = node;
    if (flags.isMesh !== true) return;
    const o = node;
    if (!o.visible) return;
    if (o.userData?.auditSkip) return;
    const name = qualifiedName(o);
    if (opts.skip?.(o, name)) return;
    if (flags.isInstancedMesh === true && !opts.includeInstanced) return;
    const geometry = o.geometry;
    const position = geometry.getAttribute("position");
    if (!position) return;
    const index = geometry.getIndex();
    const cornerCount = index ? index.count : position.count;
    const triCount = Math.floor(cornerCount / 3);
    const incompleteCorners = cornerCount % 3;
    if (cornerCount === 0) return;
    const material = o.material;
    const hasMaterial = Array.isArray(material) ? material.length > 0 && material.some(Boolean) : !!material;
    const normalAttr = geometry.getAttribute("normal");
    for (const entry of worldTransforms(o, name, flags.isInstancedMesh === true)) {
      if (!hasMaterial) noMaterial.push(entry.name);
      const meshIndex = names.length;
      names.push(entry.name);
      const m = entry.matrix;
      let degenerate = 0;
      let nonFinite = 0;
      let badNormals = 0;
      let bx0 = Infinity;
      let by0 = Infinity;
      let bz0 = Infinity;
      let bx1 = -Infinity;
      let by1 = -Infinity;
      let bz1 = -Infinity;
      const wx = new Float64Array(3);
      const wy = new Float64Array(3);
      const wz = new Float64Array(3);
      for (let t = 0; t < triCount; t++) {
        let ok = true;
        for (let c = 0; c < 3; c++) {
          const vi = index ? index.getX(t * 3 + c) : t * 3 + c;
          const lx = position.getX(vi);
          const ly = position.getY(vi);
          const lz = position.getZ(vi);
          if (!Number.isFinite(lx) || !Number.isFinite(ly) || !Number.isFinite(lz)) ok = false;
          wx[c] = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
          wy[c] = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
          wz[c] = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
          if (normalAttr) {
            const nxv = normalAttr.getX(vi);
            const nyv = normalAttr.getY(vi);
            const nzv = normalAttr.getZ(vi);
            const l2 = nxv * nxv + nyv * nyv + nzv * nzv;
            const nl = Math.sqrt(l2);
            if (!Number.isFinite(nl) || nl < 1e-5 || Math.abs(nl - 1) > opts.normalLengthTolerance) badNormals++;
          }
        }
        total++;
        if (!ok) {
          nonFinite++;
          continue;
        }
        const ux = wx[1] - wx[0];
        const uy = wy[1] - wy[0];
        const uz = wz[1] - wz[0];
        const vx = wx[2] - wx[0];
        const vy = wy[2] - wy[0];
        const vz = wz[2] - wz[0];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz);
        const a = l * 0.5;
        if (a < 1e-9) {
          degenerate++;
          continue;
        }
        const minx = Math.min(wx[0], wx[1], wx[2]);
        const miny = Math.min(wy[0], wy[1], wy[2]);
        const minz = Math.min(wz[0], wz[1], wz[2]);
        const maxx = Math.max(wx[0], wx[1], wx[2]);
        const maxy = Math.max(wy[0], wy[1], wy[2]);
        const maxz = Math.max(wz[0], wz[1], wz[2]);
        if (minx < bx0) bx0 = minx;
        if (miny < by0) by0 = miny;
        if (minz < bz0) bz0 = minz;
        if (maxx > bx1) bx1 = maxx;
        if (maxy > by1) by1 = maxy;
        if (maxz > bz1) bz1 = maxz;
        if (a < minArea) continue;
        if (bounds) {
          const mx = (wx[0] + wx[1] + wx[2]) / 3 - cx;
          const my = (wy[0] + wy[1] + wy[2]) / 3;
          const mz = (wz[0] + wz[1] + wz[2]) / 3 - cz;
          if (mx * mx + mz * mz > r2 || my < bounds.minY || my > bounds.maxY) continue;
        }
        nx /= l;
        ny /= l;
        nz /= l;
        pos.push(wx[0], wy[0], wz[0], wx[1], wy[1], wz[1], wx[2], wy[2], wz[2]);
        nrm.push(nx, ny, nz);
        dist.push(nx * wx[0] + ny * wy[0] + nz * wz[0]);
        area.push(a);
        box.push(minx, miny, minz, maxx, maxy, maxz);
        mesh.push(meshIndex);
      }
      meshBoxes.push(bx0, by0, bz0, bx1, by1, bz1);
      if (degenerate || nonFinite || badNormals || incompleteCorners) {
        defects.push({ name: entry.name, triangles: triCount, degenerate, nonFinite, badNormals, incompleteCorners });
      }
    }
  };
  if (typeof root.traverseVisible === "function") root.traverseVisible(visit);
  else root.traverse(visit);
  return {
    tris: {
      pos: Float64Array.from(pos),
      nrm: Float64Array.from(nrm),
      dist: Float64Array.from(dist),
      area: Float64Array.from(area),
      box: Float64Array.from(box),
      mesh: Int32Array.from(mesh),
      count: area.length
    },
    names,
    meshBox: Float64Array.from(meshBoxes),
    defects,
    noMaterial,
    total
  };
}
function clipArea(P, Q) {
  let out = P;
  let s = 0;
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    s += Q[i * 2] * Q[j * 2 + 1] - Q[j * 2] * Q[i * 2 + 1];
  }
  const q = s < 0 ? [Q[4], Q[5], Q[2], Q[3], Q[0], Q[1]] : Q;
  for (let i = 0; i < 3; i++) {
    const ax = q[i * 2];
    const ay = q[i * 2 + 1];
    const bx = q[(i + 1) % 3 * 2];
    const by = q[(i + 1) % 3 * 2 + 1];
    const ex = bx - ax;
    const ey = by - ay;
    const inp = out;
    if (inp.length < 6) return 0;
    out = [];
    let px = inp[inp.length - 2];
    let py = inp[inp.length - 1];
    let dprev = ex * (py - ay) - ey * (px - ax);
    for (let k = 0; k < inp.length; k += 2) {
      const cxp = inp[k];
      const cyp = inp[k + 1];
      const dcur = ex * (cyp - ay) - ey * (cxp - ax);
      if (dcur >= 0) {
        if (dprev < 0) {
          const t = dprev / (dprev - dcur);
          out.push(px + (cxp - px) * t, py + (cyp - py) * t);
        }
        out.push(cxp, cyp);
      } else if (dprev >= 0) {
        const t = dprev / (dprev - dcur);
        out.push(px + (cxp - px) * t, py + (cyp - py) * t);
      }
      px = cxp;
      py = cyp;
      dprev = dcur;
    }
  }
  if (out.length < 6) return 0;
  let a = 0;
  for (let i = 0; i < out.length; i += 2) {
    const j = (i + 2) % out.length;
    a += out[i] * out[j + 1] - out[j] * out[i + 1];
  }
  return Math.abs(a) * 0.5;
}
function coplanarPass(tris, names, top, opts) {
  const n = tris.count;
  const { nrm, dist, box, pos, mesh } = tris;
  const grid = /* @__PURE__ */ new Map();
  const eps = 1e-9;
  const angleCosine = Math.cos(Math.max(0, Math.min(Math.PI, opts.angleRadians)));
  const planeDistance = opts.planeDistance;
  const overlapArea = opts.overlapArea;
  const normalCell = opts.planeCellNormal;
  const distanceCell = opts.planeCellDistance;
  for (let i = 0; i < n; i++) {
    let cx = nrm[i * 3];
    let cy = nrm[i * 3 + 1];
    let cz = nrm[i * 3 + 2];
    let cd = dist[i];
    if (cz < -eps || Math.abs(cz) <= eps && (cy < -eps || Math.abs(cy) <= eps && cx < 0)) {
      cx = -cx;
      cy = -cy;
      cz = -cz;
      cd = -cd;
    }
    const f0 = Math.floor(cx / normalCell);
    const f1 = Math.floor(cy / normalCell);
    const f2 = Math.floor(cz / normalCell);
    const f3 = Math.floor(cd / distanceCell);
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        for (let c = 0; c < 2; c++) {
          for (let e = 0; e < 2; e++) {
            const key = `${f0 + a},${f1 + b},${f2 + c},${f3 + e}`;
            const list = grid.get(key);
            if (list) list.push(i);
            else grid.set(key, [i]);
          }
        }
      }
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const hits = /* @__PURE__ */ new Map();
  let totalCm2 = 0;
  let backToBack = 0;
  const A = [0, 0, 0, 0, 0, 0];
  const B = [0, 0, 0, 0, 0, 0];
  const test = (i, j) => {
    if (box[i * 6 + 3] + planeDistance < box[j * 6] || box[j * 6 + 3] + planeDistance < box[i * 6] || box[i * 6 + 4] + planeDistance < box[j * 6 + 1] || box[j * 6 + 4] + planeDistance < box[i * 6 + 1] || box[i * 6 + 5] + planeDistance < box[j * 6 + 2] || box[j * 6 + 5] + planeDistance < box[i * 6 + 2]) {
      return;
    }
    const nix = nrm[i * 3];
    const niy = nrm[i * 3 + 1];
    const niz = nrm[i * 3 + 2];
    const d = nix * nrm[j * 3] + niy * nrm[j * 3 + 1] + niz * nrm[j * 3 + 2];
    if (Math.abs(d) < angleCosine) return;
    if (Math.abs(nix * pos[j * 9] + niy * pos[j * 9 + 1] + niz * pos[j * 9 + 2] - dist[i]) > planeDistance) return;
    const pair = i < j ? `${i}_${j}` : `${j}_${i}`;
    if (seen.has(pair)) return;
    seen.add(pair);
    let ux;
    let uy;
    let uz;
    if (Math.abs(niz) < 0.9) {
      ux = niy * 1 - niz * 0;
      uy = niz * 0 - nix * 1;
      uz = 0;
    } else {
      ux = 0;
      uy = niz;
      uz = -niy;
    }
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = niy * uz - niz * uy;
    const vy = niz * ux - nix * uz;
    const vz = nix * uy - niy * ux;
    for (let c = 0; c < 3; c++) {
      const ix = pos[i * 9 + c * 3];
      const iy = pos[i * 9 + c * 3 + 1];
      const iz = pos[i * 9 + c * 3 + 2];
      A[c * 2] = ix * ux + iy * uy + iz * uz;
      A[c * 2 + 1] = ix * vx + iy * vy + iz * vz;
      const jx = pos[j * 9 + c * 3];
      const jy = pos[j * 9 + c * 3 + 1];
      const jz = pos[j * 9 + c * 3 + 2];
      B[c * 2] = jx * ux + jy * uy + jz * uz;
      B[c * 2 + 1] = jx * vx + jy * vy + jz * vz;
    }
    const ov = clipArea(A, B);
    if (ov < overlapArea) return;
    if (d < 0) {
      backToBack++;
      return;
    }
    const na = names[mesh[i]];
    const nb = names[mesh[j]];
    const key = na < nb ? na + " :: " + nb : nb + " :: " + na;
    totalCm2 += ov * 1e4;
    const cur = hits.get(key);
    if (cur) {
      cur.areaCm2 += ov * 1e4;
      cur.pairs++;
    } else {
      hits.set(key, {
        a: na,
        b: nb,
        areaCm2: ov * 1e4,
        at: [
          Math.round((pos[i * 9] + pos[i * 9 + 3] + pos[i * 9 + 6]) / 3 * 100) / 100,
          Math.round((pos[i * 9 + 1] + pos[i * 9 + 4] + pos[i * 9 + 7]) / 3 * 100) / 100,
          Math.round((pos[i * 9 + 2] + pos[i * 9 + 5] + pos[i * 9 + 8]) / 3 * 100) / 100
        ],
        pairs: 1
      });
    }
  };
  const order = [];
  for (const items of grid.values()) {
    if (items.length < 2) continue;
    order.length = 0;
    for (const it of items) order.push(it);
    order.sort((a, b) => box[a * 6] - box[b * 6]);
    for (let a = 0; a < order.length; a++) {
      const i = order[a];
      const maxx = box[i * 6 + 3] + planeDistance;
      for (let b = a + 1; b < order.length; b++) {
        const j = order[b];
        if (box[j * 6] > maxx) break;
        test(i, j);
      }
    }
  }
  const out = [...hits.values()].sort((x, y) => y.areaCm2 - x.areaCm2);
  for (const h of out) h.areaCm2 = Math.round(h.areaCm2 * 10) / 10;
  return { hits: out.slice(0, top), totalCm2: Math.round(totalCm2 * 10) / 10, backToBack };
}
function segmentHitsTri(ox, oy, oz, dx, dy, dz, p, t) {
  const b = t * 9;
  const e1x = p[b + 3] - p[b];
  const e1y = p[b + 4] - p[b + 1];
  const e1z = p[b + 5] - p[b + 2];
  const e2x = p[b + 6] - p[b];
  const e2y = p[b + 7] - p[b + 1];
  const e2z = p[b + 8] - p[b + 2];
  const hx = dy * e2z - dz * e2y;
  const hy = dz * e2x - dx * e2z;
  const hz = dx * e2y - dy * e2x;
  const a = e1x * hx + e1y * hy + e1z * hz;
  if (a > -1e-12 && a < 1e-12) return false;
  const f = 1 / a;
  const sx = ox - p[b];
  const sy = oy - p[b + 1];
  const sz = oz - p[b + 2];
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return false;
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = f * (dx * qx + dy * qy + dz * qz);
  if (v < 0 || u + v > 1) return false;
  const tt = f * (e2x * qx + e2y * qy + e2z * qz);
  return tt > 1e-9 && tt < 1 - 1e-9;
}
function edgesCross(p, a, b) {
  const base = a * 9;
  for (let e = 0; e < 3; e++) {
    const o = base + e * 3;
    const q = base + (e + 1) % 3 * 3;
    if (segmentHitsTri(p[o], p[o + 1], p[o + 2], p[q] - p[o], p[q + 1] - p[o + 1], p[q + 2] - p[o + 2], p, b)) {
      return true;
    }
  }
  return false;
}
function trisCross(tris, i, j) {
  return edgesCross(tris.pos, i, j) || edgesCross(tris.pos, j, i);
}
function clashPass(tris, names, meshBox, opts) {
  const allow = opts.clashAllow ?? [];
  const matchesPrefix = (name, prefix) => name.startsWith(prefix) || name.split("/").some((segment) => segment.startsWith(prefix));
  const allowed = (a, b) => {
    for (const [p, q] of allow) {
      if (matchesPrefix(a, p) && matchesPrefix(b, q) || matchesPrefix(a, q) && matchesPrefix(b, p)) return true;
    }
    return false;
  };
  const byMesh = /* @__PURE__ */ new Map();
  for (let i = 0; i < tris.count; i++) {
    const m = tris.mesh[i];
    const list = byMesh.get(m);
    if (list) list.push(i);
    else byMesh.set(m, [i]);
  }
  const ids = [...byMesh.keys()].sort((a, b) => a - b);
  const out = [];
  for (let x = 0; x < ids.length; x++) {
    const a = ids[x];
    const ab = a * 6;
    for (let y = x + 1; y < ids.length; y++) {
      const b = ids[y];
      const bb = b * 6;
      const lo0 = Math.max(meshBox[ab], meshBox[bb]);
      const lo1 = Math.max(meshBox[ab + 1], meshBox[bb + 1]);
      const lo2 = Math.max(meshBox[ab + 2], meshBox[bb + 2]);
      const hi0 = Math.min(meshBox[ab + 3], meshBox[bb + 3]);
      const hi1 = Math.min(meshBox[ab + 4], meshBox[bb + 4]);
      const hi2 = Math.min(meshBox[ab + 5], meshBox[bb + 5]);
      if (hi0 <= lo0 || hi1 <= lo1 || hi2 <= lo2) continue;
      if (allowed(names[a], names[b])) continue;
      const ta = Math.min(meshBox[ab + 3] - meshBox[ab], meshBox[ab + 4] - meshBox[ab + 1], meshBox[ab + 5] - meshBox[ab + 2]);
      const tb = Math.min(meshBox[bb + 3] - meshBox[bb], meshBox[bb + 4] - meshBox[bb + 1], meshBox[bb + 5] - meshBox[bb + 2]);
      const lim = Math.min(opts.clashDepth, Math.max(4e-3, 0.34 * Math.min(ta, tb)));
      if (Math.min(hi0 - lo0, hi1 - lo1, hi2 - lo2) < lim) continue;
      const cell = opts.clashCellSize;
      const maxCells = opts.maxCellsPerTriangle;
      const hash = /* @__PURE__ */ new Map();
      const inShared = (i) => tris.box[i * 6 + 3] >= lo0 && tris.box[i * 6] <= hi0 && tris.box[i * 6 + 4] >= lo1 && tris.box[i * 6 + 1] <= hi1 && tris.box[i * 6 + 5] >= lo2 && tris.box[i * 6 + 2] <= hi2;
      const key = (ix, iy, iz) => `${ix},${iy},${iz}`;
      const candidatesA = [];
      const oversizedA = [];
      let inserted = 0;
      for (const i of byMesh.get(a)) {
        if (!inShared(i)) continue;
        candidatesA.push(i);
        const x0 = Math.floor(Math.max(tris.box[i * 6], lo0) / cell);
        const y0 = Math.floor(Math.max(tris.box[i * 6 + 1], lo1) / cell);
        const z0 = Math.floor(Math.max(tris.box[i * 6 + 2], lo2) / cell);
        const x1 = Math.floor(Math.min(tris.box[i * 6 + 3], hi0) / cell);
        const y1 = Math.floor(Math.min(tris.box[i * 6 + 4], hi1) / cell);
        const z1 = Math.floor(Math.min(tris.box[i * 6 + 5], hi2) / cell);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > maxCells) {
          oversizedA.push(i);
          continue;
        }
        for (let ix = x0; ix <= x1; ix++) {
          for (let iy = y0; iy <= y1; iy++) {
            for (let iz = z0; iz <= z1; iz++) {
              const k = key(ix, iy, iz);
              const l = hash.get(k);
              if (l) l.push(i);
              else hash.set(k, [i]);
              inserted++;
            }
          }
        }
      }
      if (inserted === 0 && oversizedA.length === 0) continue;
      let crossings = 0;
      const probed = /* @__PURE__ */ new Set();
      const probe = (i, j) => {
        if (probed.has(i)) return false;
        probed.add(i);
        if (!trisCross(tris, i, j)) return false;
        crossings++;
        return crossings > 512;
      };
      outer: for (const j of byMesh.get(b)) {
        if (!inShared(j)) continue;
        const x0 = Math.floor(Math.max(tris.box[j * 6], lo0) / cell);
        const y0 = Math.floor(Math.max(tris.box[j * 6 + 1], lo1) / cell);
        const z0 = Math.floor(Math.max(tris.box[j * 6 + 2], lo2) / cell);
        const x1 = Math.floor(Math.min(tris.box[j * 6 + 3], hi0) / cell);
        const y1 = Math.floor(Math.min(tris.box[j * 6 + 4], hi1) / cell);
        const z1 = Math.floor(Math.min(tris.box[j * 6 + 5], hi2) / cell);
        const cells = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
        probed.clear();
        if (cells > maxCells) {
          for (const i of candidatesA) if (probe(i, j)) break outer;
          continue;
        }
        for (const i of oversizedA) if (probe(i, j)) break outer;
        for (let ix = x0; ix <= x1; ix++) {
          for (let iy = y0; iy <= y1; iy++) {
            for (let iz = z0; iz <= z1; iz++) {
              const l = hash.get(key(ix, iy, iz));
              if (!l) continue;
              for (const i of l) {
                if (probe(i, j)) break outer;
              }
            }
          }
        }
      }
      if (crossings >= opts.minimumClashCrossings) out.push({ a: names[a], b: names[b], crossings });
    }
  }
  return out.sort((p, q) => q.crossings - p.crossings);
}
function auditGeometry(root, opts = {}) {
  const settings = { ...GEOMETRY_AUDIT_DEFAULTS, ...opts };
  for (const key of ["planeDistance", "overlapArea", "planeCellNormal", "planeCellDistance", "clashCellSize", "maxCellsPerTriangle", "normalLengthTolerance"]) {
    if (!Number.isFinite(settings[key]) || settings[key] <= 0) throw new RangeError(`geometry audit option ${key} must be finite and greater than zero`);
  }
  if (!Number.isFinite(settings.angleRadians) || settings.angleRadians < 0 || settings.angleRadians > Math.PI) throw new RangeError("geometry audit option angleRadians must be between zero and pi");
  if (!Number.isFinite(settings.clashDepth) || settings.clashDepth < 0) throw new RangeError("geometry audit option clashDepth must be finite and non-negative");
  if (settings.planeCellNormal < 2 * Math.sin(settings.angleRadians * 0.5)) throw new RangeError("geometry audit option planeCellNormal must cover angleRadians for neighboring-cell lookup");
  if (settings.planeCellDistance < settings.planeDistance) throw new RangeError("geometry audit option planeCellDistance must be at least planeDistance");
  if (!Number.isInteger(settings.maxCellsPerTriangle)) throw new RangeError("geometry audit option maxCellsPerTriangle must be a positive integer");
  if (!Number.isInteger(settings.minimumClashCrossings) || settings.minimumClashCrossings < 1) throw new RangeError("geometry audit option minimumClashCrossings must be a positive integer");
  if (!(settings.maxTriangles === Infinity || Number.isInteger(settings.maxTriangles) && settings.maxTriangles >= 0)) throw new RangeError("geometry audit option maxTriangles must be a non-negative integer or Infinity");
  if (settings.top !== undefined && (!Number.isInteger(settings.top) || settings.top < 0)) throw new RangeError("geometry audit option top must be a non-negative integer");
  if (settings.minArea !== undefined && (!Number.isFinite(settings.minArea) || settings.minArea <= 0)) throw new RangeError("geometry audit option minArea must be finite and greater than zero");
  if (settings.clashAllow !== undefined && (!Array.isArray(settings.clashAllow) || settings.clashAllow.some((pair) => !Array.isArray(pair) || pair.length !== 2 || pair.some((prefix) => typeof prefix !== "string" || prefix.length === 0)))) throw new TypeError("geometry audit option clashAllow must contain pairs of non-empty string prefixes");
  const t0 = performance.now();
  const top = settings.top ?? 25;
  const collected = collect(root, settings);
  const tris = collected.tris;
  let truncated = false;
  const cap = settings.maxTriangles;
  if (tris.count > cap) {
    truncated = true;
    tris.count = cap;
  }
  const co = coplanarPass(tris, collected.names, top, settings);
  const clash = settings.clash === false ? [] : clashPass(tris, collected.names, collected.meshBox, settings);
  return {
    ms: Math.round(performance.now() - t0),
    meshes: collected.names.length,
    triangles: collected.total,
    compared: tris.count,
    truncated,
    zfight: co.hits,
    zfightTotalCm2: co.totalCm2,
    backToBack: co.backToBack,
    defects: collected.defects.sort((a, b) => b.degenerate + b.nonFinite + b.badNormals + b.incompleteCorners - (a.degenerate + a.nonFinite + a.badNormals + a.incompleteCorners)).slice(0, top),
    noMaterial: collected.noMaterial,
    clash: clash.slice(0, top)
  };
}
function logAuditReport(report) {
  const head = `GEOMETRY AUDIT  ${report.meshes} meshes / ${report.triangles} tris (${report.compared} compared${report.truncated ? ", TRUNCATED" : ""})  ${report.ms} ms`;
  console.log(head);
  console.log(
    `  zfight ${report.zfight.length} pairs / ${report.zfightTotalCm2} cm\xB2   back-to-back ${report.backToBack} (informational)   defects ${report.defects.length}   nomat ${report.noMaterial.length}   clash ${report.clash.length}`
  );
  if (report.zfight.length) console.table(report.zfight);
  if (report.defects.length) console.table(report.defects);
  if (report.clash.length) console.table(report.clash);
  if (report.noMaterial.length) console.log("  no material:", report.noMaterial);
  return report;
}
export {
  GEOMETRY_AUDIT_DEFAULTS,
  auditGeometry,
  logAuditReport
};
