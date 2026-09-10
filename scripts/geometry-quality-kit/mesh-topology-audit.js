/**
 * Audit MeshData before Three.js emission, while polygon topology and vertex
 * ownership are still visible. The default contract is one closed solid.
 * Pass { closed: false, maxComponents: Infinity, checkOrientation: false }
 * for an intentionally open surface.
 */

const DEFAULT_TOPOLOGY_OPTIONS = Object.freeze({
  closed: true,
  maxComponents: 1,
  duplicateDistance: 2e-5,
  degenerateArea: 1e-12,
  checkOrientation: true,
});

function issue(code, message, detail = {}) {
  return { code, message, ...detail };
}

function finiteVec3(v) {
  return Array.isArray(v) && v.length >= 3 &&
    Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

function triangleArea2(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  return Math.hypot(
    uy * vz - uz * vy,
    uz * vx - ux * vz,
    ux * vy - uy * vx,
  );
}

function faceArea(verts, face) {
  if (face.length < 3) return 0;
  const a = verts[face[0]];
  if (!finiteVec3(a)) return NaN;
  let area = 0;
  for (let i = 1; i + 1 < face.length; i++) {
    const b = verts[face[i]];
    const c = verts[face[i + 1]];
    if (!finiteVec3(b) || !finiteVec3(c)) return NaN;
    area += triangleArea2(a, b, c) * 0.5;
  }
  return area;
}

function signedVolume(verts, faces) {
  let volume6 = 0;
  for (const face of faces) {
    if (face.length < 3) continue;
    const a = verts[face[0]];
    for (let i = 1; i + 1 < face.length; i++) {
      const b = verts[face[i]];
      const c = verts[face[i + 1]];
      volume6 += a[0] * (b[1] * c[2] - b[2] * c[1]);
      volume6 += a[1] * (b[2] * c[0] - b[0] * c[2]);
      volume6 += a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
  }
  return volume6 / 6;
}

function duplicateVertexPairs(verts, distance) {
  if (!(distance > 0)) return [];
  const grid = new Map();
  const pairs = [];
  const distance2 = distance * distance;
  const key = (x, y, z) => `${x},${y},${z}`;
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    if (!finiteVec3(v)) continue;
    const ix = Math.floor(v[0] / distance);
    const iy = Math.floor(v[1] / distance);
    const iz = Math.floor(v[2] / distance);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(key(ix + dx, iy + dy, iz + dz));
          if (!bucket) continue;
          for (const j of bucket) {
            const u = verts[j];
            const d0 = v[0] - u[0];
            const d1 = v[1] - u[1];
            const d2 = v[2] - u[2];
            if (d0 * d0 + d1 * d1 + d2 * d2 <= distance2) pairs.push([j, i]);
          }
        }
      }
    }
    const own = key(ix, iy, iz);
    const bucket = grid.get(own);
    if (bucket) bucket.push(i);
    else grid.set(own, [i]);
  }
  return pairs;
}

function connectedFaceComponents(faces, vertexCount) {
  if (faces.length === 0) return [];
  const byEdge = new Map();
  for (let fi = 0; fi < faces.length; fi++) {
    const face = faces[fi];
    if (!Array.isArray(face)) continue;
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= vertexCount || b >= vertexCount || a === b) continue;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const list = byEdge.get(key);
      if (list) list.push(fi);
      else byEdge.set(key, [fi]);
    }
  }
  const adjacent = Array.from({ length: faces.length }, () => []);
  for (const list of byEdge.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        adjacent[list[i]].push(list[j]);
        adjacent[list[j]].push(list[i]);
      }
    }
  }
  const seen = new Uint8Array(faces.length);
  const components = [];
  for (let seed = 0; seed < faces.length; seed++) {
    if (seen[seed]) continue;
    const component = [];
    const stack = [seed];
    seen[seed] = 1;
    while (stack.length) {
      const fi = stack.pop();
      component.push(fi);
      for (const next of adjacent[fi]) {
        if (seen[next]) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    components.push(component);
  }
  return components;
}

export function auditMeshData(meshData, options = {}) {
  const opts = { ...DEFAULT_TOPOLOGY_OPTIONS, ...options };
  const verts = meshData?.verts ?? [];
  const faces = meshData?.faces ?? [];
  const issues = [];
  const vertexUse = new Uint32Array(verts.length);
  const edgeUse = new Map();
  let invalidVertices = 0;
  let invalidIndices = 0;
  let degenerateFaces = 0;

  for (let i = 0; i < verts.length; i++) {
    if (!finiteVec3(verts[i])) invalidVertices++;
  }

  for (let fi = 0; fi < faces.length; fi++) {
    const face = faces[fi];
    if (!Array.isArray(face) || face.length < 3) {
      degenerateFaces++;
      continue;
    }
    let valid = true;
    let finite = true;
    const unique = new Set();
    for (const vi of face) {
      if (!Number.isInteger(vi) || vi < 0 || vi >= verts.length) {
        invalidIndices++;
        valid = false;
        continue;
      }
      vertexUse[vi]++;
      unique.add(vi);
      if (!finiteVec3(verts[vi])) finite = false;
    }
    const area = valid && finite ? faceArea(verts, face) : NaN;
    if (!valid || !finite || unique.size < 3 || !Number.isFinite(area) || area <= opts.degenerateArea) {
      degenerateFaces++;
    }
    if (!valid) continue;
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      if (a === b) continue;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let edge = edgeUse.get(key);
      if (!edge) {
        edge = { count: 0, direction: 0 };
        edgeUse.set(key, edge);
      }
      edge.count++;
      edge.direction += a < b ? 1 : -1;
    }
  }

  const looseVertices = [];
  for (let i = 0; i < vertexUse.length; i++) if (vertexUse[i] === 0) looseVertices.push(i);
  const duplicateVertices = duplicateVertexPairs(verts, opts.duplicateDistance);
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  let inconsistentWindingEdges = 0;
  for (const edge of edgeUse.values()) {
    if (edge.count === 1) boundaryEdges++;
    else if (edge.count !== 2) nonManifoldEdges++;
    else if (edge.direction !== 0) inconsistentWindingEdges++;
  }
  const faceComponents = connectedFaceComponents(faces, verts.length);
  const components = faceComponents.length;
  const componentVolumes = invalidVertices || invalidIndices || degenerateFaces ? [] : faceComponents.map((component) => signedVolume(verts, component.map((fi) => faces[fi])));
  const volume = componentVolumes.length === faceComponents.length ? componentVolumes.reduce((sum, value) => sum + value, 0) : NaN;

  if (invalidVertices) issues.push(issue("non-finite-vertex", `${invalidVertices} vertices are non-finite`, { count: invalidVertices }));
  if (invalidIndices) issues.push(issue("invalid-index", `${invalidIndices} face indices are invalid`, { count: invalidIndices }));
  if (degenerateFaces) issues.push(issue("degenerate-face", `${degenerateFaces} faces have fewer than three usable corners or zero area`, { count: degenerateFaces }));
  if (looseVertices.length) issues.push(issue("loose-vertex", `${looseVertices.length} vertices are unused`, { count: looseVertices.length, sample: looseVertices.slice(0, 20) }));
  if (duplicateVertices.length) issues.push(issue("duplicate-vertex", `${duplicateVertices.length} vertex pairs are within ${opts.duplicateDistance}`, { count: duplicateVertices.length, sample: duplicateVertices.slice(0, 20) }));
  if (opts.closed && boundaryEdges) issues.push(issue("open-boundary", `${boundaryEdges} edges belong to only one face`, { count: boundaryEdges }));
  if (nonManifoldEdges) issues.push(issue("non-manifold-edge", `${nonManifoldEdges} edges do not belong to one or two faces`, { count: nonManifoldEdges }));
  if (inconsistentWindingEdges) issues.push(issue("inconsistent-winding", `${inconsistentWindingEdges} shared edges run in the same direction on both incident faces`, { count: inconsistentWindingEdges }));
  if (components > opts.maxComponents) issues.push(issue("detached-component", `${components} disconnected face components exceed the allowed ${opts.maxComponents}`, { count: components }));
  if (faces.length === 0) issues.push(issue("empty-mesh", "mesh has no faces"));
  const closedTopology = boundaryEdges === 0 && nonManifoldEdges === 0 && inconsistentWindingEdges === 0;
  if (opts.closed && opts.checkOrientation && closedTopology && componentVolumes.length === faceComponents.length) {
    const insideOut = componentVolumes.filter((value) => value <= 0);
    if (insideOut.length) issues.push(issue("inside-out", `${insideOut.length} closed components do not have positive signed volume`, { count: insideOut.length, signedVolume: volume, componentVolumes: insideOut.slice(0, 20) }));
  }
  if (meshData?.faceMat && meshData.faceMat.length !== faces.length) {
    issues.push(issue("material-face-count", `faceMat has ${meshData.faceMat.length} entries for ${faces.length} faces`));
  }
  if (meshData?.faceMat) {
    const invalidMaterialIndices = meshData.faceMat.filter((value) => !Number.isInteger(value) || value < 0).length;
    if (invalidMaterialIndices) issues.push(issue("invalid-material-index", `${invalidMaterialIndices} faceMat entries are not non-negative integers`, { count: invalidMaterialIndices }));
  }
  if (meshData?.colors && meshData.colors.length !== verts.length) {
    issues.push(issue("color-vertex-count", `colors has ${meshData.colors.length} entries for ${verts.length} vertices`));
  }
  if (meshData?.colors) {
    const invalidColors = meshData.colors.filter((color) => !finiteVec3(color)).length;
    if (invalidColors) issues.push(issue("invalid-vertex-color", `${invalidColors} vertex colors are non-finite`, { count: invalidColors }));
  }
  if (meshData?.uvs && meshData.uvs.length !== faces.length) {
    issues.push(issue("uv-face-count", `uvs has ${meshData.uvs.length} entries for ${faces.length} faces`));
  }
  if (meshData?.uvs) {
    let invalidUvFaces = 0;
    for (let fi = 0; fi < Math.min(meshData.uvs.length, faces.length); fi++) {
      const faceUv = meshData.uvs[fi];
      if (faceUv === null) continue;
      if (!Array.isArray(faceUv) || !Array.isArray(faces[fi]) || faceUv.length !== faces[fi].length || faceUv.some((uv) => !Array.isArray(uv) || uv.length < 2 || !Number.isFinite(uv[0]) || !Number.isFinite(uv[1]))) invalidUvFaces++;
    }
    if (invalidUvFaces) issues.push(issue("invalid-face-uv", `${invalidUvFaces} faces do not have one finite UV per corner`, { count: invalidUvFaces }));
  }

  return {
    ok: issues.length === 0,
    issues,
    counts: {
      vertices: verts.length,
      faces: faces.length,
      edges: edgeUse.size,
      components,
      looseVertices: looseVertices.length,
      duplicateVertexPairs: duplicateVertices.length,
      boundaryEdges,
      nonManifoldEdges,
      inconsistentWindingEdges,
      degenerateFaces,
    },
    signedVolume: volume,
    componentVolumes,
  };
}

export function auditTriangleSoup(soup, options = {}) {
  const positions = soup?.positions ?? [];
  const normals = soup?.normals ?? [];
  const unitTolerance = options.unitNormalTolerance ?? 1e-5;
  const issues = [];
  let nonFinitePositions = 0;
  let badNormals = 0;
  let degenerateTriangles = 0;
  let opposedNormals = 0;

  for (const value of positions) if (!Number.isFinite(value)) nonFinitePositions++;
  if (positions.length % 9 !== 0) issues.push(issue("triangle-position-count", "position count is not divisible by nine"));
  if (normals.length !== positions.length) issues.push(issue("normal-count", "normal count does not match position count"));
  for (let i = 0; i + 2 < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (!Number.isFinite(length) || Math.abs(length - 1) > unitTolerance) badNormals++;
  }
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const a = positions.slice(i, i + 3);
    const b = positions.slice(i + 3, i + 6);
    const c = positions.slice(i + 6, i + 9);
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const gx = uy * vz - uz * vy;
    const gy = uz * vx - ux * vz;
    const gz = ux * vy - uy * vx;
    const area2 = Math.hypot(gx, gy, gz);
    if (area2 <= (options.degenerateArea ?? DEFAULT_TOPOLOGY_OPTIONS.degenerateArea) * 2) {
      degenerateTriangles++;
      continue;
    }
    if (options.checkNormalDirection !== false && normals.length >= i + 9) {
      const nx = normals[i] + normals[i + 3] + normals[i + 6];
      const ny = normals[i + 1] + normals[i + 4] + normals[i + 7];
      const nz = normals[i + 2] + normals[i + 5] + normals[i + 8];
      if (Number.isFinite(nx + ny + nz) && gx * nx + gy * ny + gz * nz <= 0) opposedNormals++;
    }
  }
  if (nonFinitePositions) issues.push(issue("non-finite-position", `${nonFinitePositions} emitted position values are non-finite`, { count: nonFinitePositions }));
  if (badNormals) issues.push(issue("bad-normal", `${badNormals} emitted normals are non-finite, zero, or non-unit`, { count: badNormals }));
  if (degenerateTriangles) issues.push(issue("degenerate-triangle", `${degenerateTriangles} emitted triangles have zero area`, { count: degenerateTriangles }));
  if (opposedNormals) issues.push(issue("opposed-normal", `${opposedNormals} emitted triangles have normals opposed to their winding`, { count: opposedNormals }));
  return { ok: issues.length === 0, issues, triangles: Math.floor(positions.length / 9) };
}

export function assertMeshAudit(report, label = "mesh") {
  if (report.ok) return report;
  const detail = report.issues.map((entry) => `${entry.code}: ${entry.message}`).join("\n- ");
  throw new Error(`${label} failed geometry audit:\n- ${detail}`);
}

export { DEFAULT_TOPOLOGY_OPTIONS };
