/**
 * Build one mesh per named part for quality gates, then merge by material slot
 * only after those gates pass. Part identity is intentionally retained in the
 * audit hierarchy and intentionally discarded in the draw-call hierarchy.
 */
import { Group, Mesh } from "three";
import { buildGroup, cleanMesh, toGeometry } from "./procedural-mesh.js";

function normalizePart(part, index) {
  if (!part?.meshData) throw new TypeError(`assembly part ${index} needs meshData`);
  if (!Array.isArray(part.meshData.verts) || !Array.isArray(part.meshData.faces)) throw new TypeError(`assembly part ${index} meshData needs verts and faces arrays`);
  if (!part.name) throw new TypeError(`assembly part ${index} needs a stable name`);
  if (!part.slot) throw new TypeError(`assembly part ${part.name} needs a material slot`);
  return part;
}

function preparedMeshData(part, clean) {
  const source = part.meshData;
  const meshData = typeof source.clone === "function" ? source.clone() : {
    ...source,
    verts: source.verts.map((vertex) => [...vertex]),
    faces: source.faces.map((face) => [...face]),
    uvs: source.uvs ? source.uvs.map((face) => face ? face.map((uv) => [...uv]) : null) : null,
    colors: source.colors ? source.colors.map((color) => [...color]) : null,
    shading: source.shading ? { ...source.shading } : { mode: "flat" },
    faceMat: source.faceMat ? [...source.faceMat] : null,
    provenance: null
  };
  return clean ? cleanMesh(meshData) : meshData;
}

export function buildNamedAuditGroup(parts, materials, options = {}) {
  const group = new Group();
  group.name = options.name ?? "geometry-audit-parts";
  const clean = options.clean !== false;
  const normalized = parts.map(normalizePart);
  const names = new Set();
  for (const part of normalized) {
    if (names.has(part.name)) throw new Error(`duplicate assembly part name "${part.name}"`);
    names.add(part.name);
  }
  normalized.forEach((part) => {
    const material = materials[part.slot];
    if (!material) throw new Error(`no material bound for slot "${part.slot}"`);
    const geometry = toGeometry(preparedMeshData(part, clean), options.uvScale ?? 1);
    const mesh = new Mesh(geometry, material);
    mesh.name = part.name;
    mesh.castShadow = part.castShadow ?? options.castShadow ?? true;
    mesh.receiveShadow = part.receiveShadow ?? options.receiveShadow ?? true;
    mesh.userData.geometryPart = {
      slot: part.slot,
      contract: part.contract ?? null,
    };
    group.add(mesh);
  });
  return group;
}

export function buildMergedAssembly(parts, materials, options = {}) {
  const slots = {};
  for (const part of parts.map(normalizePart)) {
    (slots[part.slot] ??= []).push(preparedMeshData(part, options.clean !== false));
  }
  return buildGroup(slots, materials, { ...options, clean: false });
}

export function disposeHierarchy(root, disposeMaterials = false) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((node) => {
    if (!node.isMesh) return;
    if (node.geometry) geometries.add(node.geometry);
    if (!disposeMaterials) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
}
