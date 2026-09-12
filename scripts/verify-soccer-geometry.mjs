import assert from 'node:assert/strict';
import { Box3 } from 'three/webgpu';
import { SoccerStadium } from '../src/worlds/soccer/stadium.ts';
import { JellySkates } from '../src/worlds/soccer/skates.ts';
import { FIELD, SKATE, ENTRANCE, GOAL, SOCCER_PORTAL } from '../src/worlds/soccer/layout.ts';
import { MeshData, cleanMesh } from './geometry-quality-kit/procedural-mesh.js';
import { auditMeshData, auditTriangleSoup } from './geometry-quality-kit/mesh-topology-audit.js';
import { auditGeometry, logAuditReport } from './geometry-quality-kit/geometry-audit.js';
import { runGeometryContract, nearCheck, minimumCheck, assertGeometryContract } from './geometry-quality-kit/geometry-contract.js';

const stadium=new SoccerStadium(true),skates=new JellySkates(true);let parts=0,triangles=0;
for(const root of [stadium.group,skates.group])root.traverse(mesh=>{
  if(!mesh.isMesh)return;const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,ix=g.index?.array??Array.from({length:p.count},(_,i)=>i),positions=[],normals=[];
  const vertices=Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]),faces=[];
  for(let i=0;i<ix.length;i+=3){faces.push([ix[i],ix[i+1],ix[i+2]]);for(let j=0;j<3;j++){const id=ix[i+j];positions.push(...vertices[id]);normals.push(n.getX(id),n.getY(id),n.getZ(id));}}
  const emitted=auditTriangleSoup({positions,normals},{degenerateArea:1e-15});assert(emitted.ok,`${mesh.name}: ${JSON.stringify(emitted.issues)}`);
  // Grass is an intentional aggregate of 26,000 closed tetrahedral fibers;
  // audit the reusable four-face topology plus every emitted triangle/normal.
  const data=mesh.userData.aggregate?MeshData.from(vertices.slice(0,12),faces.slice(0,4)):MeshData.from(vertices,faces);data.frame='y-up';cleanMesh(data,1e-8);
  const report=auditMeshData(data,{duplicateDistance:1e-8,degenerateArea:1e-15});assert(report.ok,`${mesh.name}: ${JSON.stringify(report.issues)}`);parts++;triangles+=ix.length/3;
});
const bounds=new Box3().setFromObject(stadium.turf),measurements={width:bounds.max.x-bounds.min.x,length:bounds.max.z-bounds.min.z,opening:ENTRANCE.width,arrivalClearance:SOCCER_PORTAL.z-.1-(ENTRANCE.z+.043),skateHeight:SKATE.lift,goalRouteClearance:ENTRANCE.x-ENTRANCE.width/2-(GOAL.width/2+GOAL.post),concourseDepth:ENTRANCE.z-.26-.038-(FIELD.length/2+GOAL.depth)};
assertGeometryContract(runGeometryContract({name:'soccer dimensions',checks:[nearCheck('width',m=>m.width,FIELD.width,1e-6),nearCheck('length',m=>m.length,FIELD.length,1e-6),minimumCheck('entry opening',m=>m.opening,.25),minimumCheck('camera-side arrival clearance',m=>m.arrivalClearance,.045),nearCheck('skate height',m=>m.skateHeight,.014,1e-8),minimumCheck('entrance does not lead into goal',m=>m.goalRouteClearance,.15),minimumCheck('clear concourse behind net',m=>m.concourseDepth,.25)]},measurements));
// A hinge sleeve encloses the leaf's pivot rail and keys into the jamb.
// These four mechanical mounts are the only permitted solid penetrations.
const hingeAllow=[];for(const side of [-1,1])for(const y of [.042,.18]){hingeAllow.push(['entrance-arch',`gate-hinge-${side}-${y}`],[`soccer-stadium/stadium-parts/open-gate-${side}/gate-leaf-frame`,`gate-hinge-${side}-${y}`]);}
const options={planeDistance:.000025,overlapArea:2e-8,planeCellDistance:.001,clash:true,clashDepth:.0015,clashCellSize:.02,maxTriangles:600000,top:100,clashAllow:hingeAllow};
for(const root of [stadium.group,skates.group]) {
  const report=auditGeometry(root,{...options,skip:mesh=>mesh.userData.aggregate===true});logAuditReport(report);
  assert(!report.truncated&&report.zfight.length===0&&report.defects.length===0&&report.noMaterial.length===0&&report.clash.length===0,'named manufactured assembly must pass');
}
const merged=new SoccerStadium();const report=auditGeometry(merged.group,{...options,clash:false,skip:mesh=>mesh.userData.aggregate===true});logAuditReport(report);assert(!report.truncated&&report.zfight.length===0&&report.defects.length===0,'post-batch assembly must pass');
console.log({parts,triangles,measurements});stadium.dispose();skates.dispose();merged.dispose();
