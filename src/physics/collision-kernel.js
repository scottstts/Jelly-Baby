import { PHYS } from "./constants.js";

function packPoint(packed,offset,point){
  if(packed[offset]!==point.x)packed[offset]=point.x;
  if(packed[offset+1]!==point.y)packed[offset+1]=point.y;
  if(packed[offset+2]!==point.z)packed[offset+2]=point.z;
}

function packHalfSize(packed,offset,halfSize,delta){
  const x=halfSize.x+delta,y=halfSize.y+delta,z=halfSize.z+delta;
  if(packed[offset]!==x)packed[offset]=x;
  if(packed[offset+1]!==y)packed[offset+1]=y;
  if(packed[offset+2]!==z)packed[offset+2]=z;
}

/** Collision buffers belong to one soft-body module and never grow its memory. */
export function createCollisionKernels(ex,allocCopy,allocZero) {
  let contact=null,clearance=null;
  const [boundsPtr,boundsView]=allocZero(6,Float64Array);
  const gridBuffer=(state,length,Ctor)=>{
    if(!state.grid||state.grid[1].length<length){
      state.grid=allocZero(Math.max(length,(state.grid?.[1].length??0)*2),Ctor);
      state.activeGrid=null;
    }
    if(state.activeGrid?.[1].length!==length){
      const [ptr,view]=state.grid;
      state.activeGrid=[ptr,view.length===length?view:view.subarray(0,length)];
    }
    return state.activeGrid;
  };
  return {
    collisionBounds(magnitude,error){ex.collision_bounds(boundsPtr,magnitude,error);return boundsView;},
    createFacilityCollision(vertices,denominators,magnitude,error){
      const [verticesPtr]=allocCopy(vertices,Uint32Array),[denominatorsPtr]=allocCopy(denominators,Float64Array);
      let capacity=0,boxesPtr=0,candidatesPtr=0,motionsPtr=0,packed,motions;
      const motionList=[];
      const samples=vertices.length;
      return {
        /** @param {Float64Array | undefined} bounds */
        resolveBoxes(boxes,margin,bounds=undefined){
          // Unknown user-defined motions keep their callback semantics in JS.
          // Turf landing boxes also keep their local deformable response in JS;
          // the native bulk-throw sweep intentionally has no per-box skip bit.
          for(let i=0;i<boxes.length;i++)if(boxes[i].skipThrowSweep||(boxes[i].motion&&!boxes[i].motion.nativePendulum))return null;
          if(boxes.length>capacity){
            capacity=Math.max(boxes.length,capacity*2,16);
            [boxesPtr,packed]=allocZero(capacity*16,Float64Array);
            [candidatesPtr]=allocZero(capacity,Uint32Array);
            [motionsPtr,motions]=allocZero(capacity*4,Float64Array);
          }
          let motionCount=0;
          for(let i=0;i<boxes.length;i++){
            const box=boxes[i],offset=i*16;
            // Only write transforms that changed; static records stay resident.
            packPoint(packed,offset,box.center);
            packPoint(packed,offset+3,box.xAxis);
            packPoint(packed,offset+6,box.yAxis);
            packPoint(packed,offset+9,box.zAxis);
            packHalfSize(packed,offset+12,box.halfSize,(box.margin??margin)-margin);
            let index=-1;
            if(box.motion){
              const motion=box.motion.nativePendulum;
              for(let j=0;j<motionCount;j++)if(motionList[j]===motion){index=j;break;}
              if(index<0){index=motionCount++;motionList[index]=motion;const j=index*4;
                motions[j]=motion.speed;motions[j+1]=motion.pivotY;motions[j+2]=motion.pivotZ;motions[j+3]=motion.inertia;
              }
            }
            packed[offset+15]=index;
          }
          if(bounds)boundsView.set(bounds);
          const changed=ex.collision_boxes(verticesPtr,denominatorsPtr,samples,magnitude,error,boxesPtr,boxes.length,candidatesPtr,motionsPtr,margin,PHYS.restitution,PHYS.floor,bounds?boundsPtr:0)!==0;
          for(let i=0;i<motionCount;i++)motionList[i].speed=motions[i*4];
          return changed;
        },
        /** @param {Float64Array | undefined} bounds */
        resolveCylinder(cx,cz,radius,minY,maxY,margin,bounds=undefined){
          if(bounds)boundsView.set(bounds);
          return ex.collision_cylinder(verticesPtr,denominatorsPtr,samples,magnitude,error,cx,cz,radius,minY,maxY,margin,PHYS.floor,bounds?boundsPtr:0)!==0;
        },
      };
    },
    sampleBlanket(surface,heights,columns,rows,dx,dz,bedX,bedZ){
      if(!contact){
        const [ids]=allocCopy(surface.bindingIds,Uint32Array),[weights]=allocCopy(surface.bindingWeights,Float64Array),[indices]=allocCopy(surface.indices,Uint32Array);
        const [projected]=allocZero(surface.positions.length,Float64Array);
        contact={ids,weights,indices,projected};
      }
      const [ptr,view]=gridBuffer(contact,heights.length,Float64Array);view.set(heights);
      ex.blanket_contact(contact.ids,contact.weights,contact.indices,surface.positions.length/3,surface.indices.length,contact.projected,ptr,columns,rows,dx,dz,bedX,bedZ);
      heights.set(view);
    },
    clearBlanket(surface,cloth,columns,rows,dx,dz,bedX,bedZ){
      if(!clearance){
        const [indices]=allocCopy(surface.indices,Uint32Array),[projected]=allocZero(surface.positions.length,Float64Array);
        clearance={indices,projected};
      }
      const [ptr,view]=gridBuffer(clearance,cloth.length,Float32Array);view.set(cloth);
      const changed=ex.blanket_clearance(clearance.indices,surface.indices.length,clearance.projected,ptr,columns,rows,dx,dz,bedX,bedZ)!==0;
      if(changed)cloth.set(view);
      return changed;
    },
  };
}
