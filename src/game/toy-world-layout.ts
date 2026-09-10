import { CURB_OUTER_EDGE, trackPoint } from './toy-track-layout.ts';

/** Lightweight portal placement shared by travel and toy-world scenery. */
const PORTAL_TRACK_T=.125;
const PORTAL_HOUSING_RADIUS=.079;
const PORTAL_ROAD_CLEARANCE=.18;
const portalPoint=trackPoint(PORTAL_TRACK_T,CURB_OUTER_EDGE+PORTAL_HOUSING_RADIUS+PORTAL_ROAD_CLEARANCE);
export const TRACK_PORTAL={x:portalPoint.x,z:portalPoint.z};
export const PORTAL_ARRIVAL_DISTANCE=.10;

/**
 * Keep the baby on the camera side of a portal after teleporting. Input.teleport
 * preserves the camera-to-body offset, so matching this sign guarantees the
 * portal cannot end up between the camera and the newly arrived baby.
 */
export function portalArrivalZ(portalZ:number,bodyZ:number,cameraZ:number) {
  return portalZ+(cameraZ<bodyZ?-1:1)*PORTAL_ARRIVAL_DISTANCE;
}

/** Horizontal facing angle that points the baby's +Z rest direction at the camera. */
export function cameraFacingYaw(bodyX:number,bodyZ:number,cameraX:number,cameraZ:number) {
  return Math.atan2(cameraX-bodyX,cameraZ-bodyZ);
}
