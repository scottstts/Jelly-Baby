import assert from 'node:assert/strict';
import { Box3 } from 'three/webgpu';
import { Tricycle } from '../src/worlds/toy-track/facilities/tricycle/graphics.ts';
import { JellyPortal } from '../src/facilities/portal/graphics.ts';
import { ToyTrack } from '../src/worlds/toy-track/graphics/track.ts';
import { fitGrips } from '../src/worlds/toy-track/facilities/tricycle/fit.ts';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';
import { auditMeshData, auditTriangleSoup } from './geometry-quality-kit/mesh-topology-audit.js';
import { MeshData, cleanMesh } from './geometry-quality-kit/procedural-mesh.js';
import { auditGeometry, logAuditReport } from './geometry-quality-kit/geometry-audit.js';

const body=new SoftBody(loadModel()),grips=fitGrips(body);
console.log('Skin-fitted grip contacts:',grips);
const bike=new Tricycle(grips,true),portal=new JellyPortal(0,0,true),track=new ToyTrack(true);
portal.group.updateMatrixWorld(true);
const portalTrays=['front','back'].map(face=>portal.group.getObjectByName(`rubber-undertray-${face}`));
assert(portalTrays.every(Boolean),'portal has mirrored continuous rubber undertrays');
for(const portalTray of portalTrays) {
  portalTray.geometry.computeBoundingBox();
  const trayBounds=portalTray.geometry.boundingBox.clone().applyMatrix4(portalTray.matrixWorld);
  assert(trayBounds.min.y>.001,'portal undertrays stay above the tabletop to avoid floor z-fighting');
}
const portalHousing=portal.group.getObjectByName('aperture-housing');
assert(portalHousing,'portal has a continuous aperture housing');
const housingBounds=new Box3().setFromObject(portalHousing);
for(const face of [-1,1]) {
  const base=portal.group.getObjectByName(`integrated-power-base-${face===1?'front':'back'}`);
  const panel=portal.group.getObjectByName(`control-panel-recess-${face}`);
  assert(base&&panel,'portal has mirrored panel supports');
  assert(new Box3().setFromObject(base).intersectsBox(new Box3().setFromObject(panel)),'each dial panel keys into its mirrored bottom bar');
  for(let i=0;i<3;i++) {
    const rail=portal.group.getObjectByName(`energy-cartridge-${face}-${i}`);
    assert(rail,'portal has all face cartridges');
    assert(new Box3().setFromObject(rail).intersectsBox(housingBounds),'each cartridge sweep seats into the side wall');
  }
}
const infieldHouses=track.group.children.filter(o=>o.name==='scaled-infield-house');
const infieldTrees=track.group.children.filter(o=>o.name==='scaled-infield-tree');
const outerTrees=track.group.children.filter(o=>o.name==='trackside-tree');
assert.equal(infieldHouses.length,4);assert.equal(infieldTrees.length,7);assert.equal(outerTrees.length,7);
assert(infieldHouses.every(o=>o.scale.x===2&&o.scale.y===2&&o.scale.z===2),'only infield houses use the twofold scenery scale');
assert(infieldTrees.every(o=>o.scale.x===2&&o.scale.y===2&&o.scale.z===2),'infield trees use the twofold scenery scale');
assert(outerTrees.every(o=>o.scale.x===1&&o.scale.y===1&&o.scale.z===1),'outer trees keep their original object scale');
for(const kind of ['brick','pen','bottle','eraser','spool']){const prop=track.group.getObjectByName(kind);assert(prop&&prop.scale.x===1&&prop.scale.y===1&&prop.scale.z===1,`${kind} is repositioned but not scaled`);}
let failed=0,parts=0;
function topology(root) {
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,indices=g.index?.array??Array.from({length:p.count},(_,i)=>i);
    const positions=[],normals=[],verts=[],faces=[];
    for(let i=0;i<p.count;i++)verts.push([p.getX(i),p.getY(i),p.getZ(i)]);
    for(let i=0;i<indices.length;i+=3){faces.push([indices[i],indices[i+1],indices[i+2]]);for(let j=0;j<3;j++){const k=indices[i+j];positions.push(...verts[k]);normals.push(n.getX(k),n.getY(k),n.getZ(k));}}
    const data=MeshData.from(verts,faces);data.frame='y-up';cleanMesh(data,1e-8);
    const open=mesh.geometry.type==='ShapeGeometry'; // bunting fabric is the only deliberate sheet.
    const reports=[auditMeshData(data,{closed:!open,duplicateDistance:1e-8,degenerateArea:1e-15}),auditTriangleSoup({positions,normals},{degenerateArea:1e-15})];
    for(const report of reports)if(!report.ok){failed++;console.log(mesh.name||mesh.parent.name,report.issues?.slice(0,5)??report);}
    parts++;
  });
}
topology(bike.group);topology(portal.group);topology(track.group);
for(const root of [bike.group,portal.group]) {
  // The portal's base is a keyed support joint: its deeper bar deliberately
  // overlaps the shell and each face control panel so the hardware cannot read
  // as detached in a side view. Keep those exact allowances narrow and audit
  // every other solid pair normally.
  const clashAllow=root.name==='jelly-portal'?[['aperture-housing','integrated-power-base'],['control-panel-recess','integrated-power-base']]:undefined;
  const report=auditGeometry(root,{planeDistance:.00003,overlapArea:1e-8,planeCellDistance:.001,clash:true,clashDepth:.002,clashCellSize:.01,clashAllow,top:200});
  console.log(root.name,report.clash.map(pair=>[pair.a,pair.b]));logAuditReport({...report,clash:[]});
  assert(!report.truncated);if(report.zfight.length||report.defects.length||report.noMaterial.length)failed++;
  if(root.name==='jelly-portal')assert.equal(report.clash.length,0,'portal named parts have no unowned solid clashes');
}
const mergedPortal=new JellyPortal(0,0,false);
const mergedReport=auditGeometry(mergedPortal.group,{planeDistance:.00003,overlapArea:1e-8,planeCellDistance:.001,clash:false,top:200});
assert(!mergedReport.truncated&&mergedReport.zfight.length===0&&mergedReport.defects.length===0&&mergedReport.noMaterial.length===0,'batched portal keeps clean emitted surfaces');
mergedPortal.dispose();
console.log({parts,failed});assert.equal(failed,0,'named solids and emitted geometry pass quality-kit gates');
bike.dispose();portal.dispose();track.dispose();
