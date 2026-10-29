export function pictureBounds(p,width,height){
 const w=width*Math.abs((p.zoomX??100)/100),h=height*Math.abs((p.zoomY??100)/100);
 return {x:(p.x||0)-(p.origin===1?w/2:0),y:(p.y||0)-(p.origin===1?h/2:0),width:w,height:h};
}
export function unionBounds(rects){
 const valid=rects.filter(r=>Object.values(r).every(Number.isFinite)&&r.width>0&&r.height>0);
 if(!valid.length)return {x:0,y:0,width:816,height:624};
 const x=Math.min(...valid.map(r=>r.x)),y=Math.min(...valid.map(r=>r.y));
 return {x,y,width:Math.max(...valid.map(r=>r.x+r.width))-x,height:Math.max(...valid.map(r=>r.y+r.height))-y};
}
