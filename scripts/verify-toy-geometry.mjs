import assert from 'node:assert/strict';
import { Tricycle } from '../src/graphics/tricycle.ts';
import { JellyPortal } from '../src/graphics/jelly-portal.ts';
import { ToyTrack } from '../src/graphics/toy-track.ts';
import { fitGrips } from '../src/game/tricycle-fit.ts';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';
import { auditMeshData, auditTriangleSoup } from './geometry-quality-kit/mesh-topology-audit.js';
import { MeshData, cleanMesh } from './geometry-quality-kit/procedural-mesh.js';
import { auditGeometry, logAuditReport } from './geometry-quality-kit/geometry-audit.js';

const body=new SoftBody(loadModel()),grips=fitGrips(body);
console.log('Skin-fitted grip contacts:',grips);
const bike=new Tricycle(grips,true),portal=new JellyPortal(0,0,true),track=new ToyTrack(true);
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
  const report=auditGeometry(root,{planeDistance:.00003,overlapArea:1e-8,planeCellDistance:.001,clash:true,clashDepth:.002,clashCellSize:.01,top:200});
  console.log(root.name,report.clash.map(pair=>[pair.a,pair.b]));logAuditReport({...report,clash:[]});
  assert(!report.truncated);if(report.zfight.length||report.defects.length||report.noMaterial.length)failed++;
}
console.log({parts,failed});assert.equal(failed,0,'named solids and emitted geometry pass quality-kit gates');
bike.dispose();portal.dispose();track.dispose();
