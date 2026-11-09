import type {Change} from './live.ts';
import {areaIncludes} from './model.ts';
export function notification(event:Change,area:string,last:string){
 if(!event.arrival||!event.eventId||!/^\d+$/.test(event.eventId)||last&&BigInt(event.eventId)<=BigInt(last))return null;
 const count=event.arrivalModules?Object.entries(event.arrivalModules).reduce((sum,[module,n])=>sum+(areaIncludes(area,[module])?n:0),0):!event.modules||areaIncludes(area,event.modules)?event.arrivalCount||1:0;
 return count>0?{count,last:event.eventId}:null;
}
