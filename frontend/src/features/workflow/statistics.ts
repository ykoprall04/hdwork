
export function formatAverage(seconds:number){const minutes=Math.floor(seconds/60);return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}
