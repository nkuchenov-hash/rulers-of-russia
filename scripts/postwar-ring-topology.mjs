// Planar topology diagnostic only; does not establish historical accuracy.
// A bounding-volume hierarchy avoids quadratic scanning of dense coastline edges.
const EPS=1e-12;
const overlaps=(a,b)=>a.minX<=b.maxX+EPS&&b.minX<=a.maxX+EPS&&a.minY<=b.maxY+EPS&&b.minY<=a.maxY+EPS;
function intersects(a,b){
 const orient=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
 const [p,q]=a.points,[r,s]=b.points;
 const o1=orient(p,q,r),o2=orient(p,q,s),o3=orient(r,s,p),o4=orient(r,s,q);
 const inBox=(u,v,w)=>w[0]>=Math.min(u[0],v[0])-EPS&&w[0]<=Math.max(u[0],v[0])+EPS&&w[1]>=Math.min(u[1],v[1])-EPS&&w[1]<=Math.max(u[1],v[1])+EPS;
 if(Math.abs(o1)<=EPS&&inBox(p,q,r))return true;
 if(Math.abs(o2)<=EPS&&inBox(p,q,s))return true;
 if(Math.abs(o3)<=EPS&&inBox(r,s,p))return true;
 if(Math.abs(o4)<=EPS&&inBox(r,s,q))return true;
 return (o1>EPS)!==(o2>EPS)&&(o3>EPS)!==(o4>EPS);
}
function build(items){
 const box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
 for(const s of items){box.minX=Math.min(box.minX,s.minX);box.minY=Math.min(box.minY,s.minY);box.maxX=Math.max(box.maxX,s.maxX);box.maxY=Math.max(box.maxY,s.maxY)}
 if(items.length<=8)return {...box,items};
 const axis=(box.maxX-box.minX)>=(box.maxY-box.minY)?'x':'y';
 items.sort((a,b)=>(axis==='x'?a.minX+a.maxX:a.minY+a.maxY)-(axis==='x'?b.minX+b.maxX:b.minY+b.maxY));
 const mid=items.length>>1;
 return {...box,left:build(items.slice(0,mid)),right:build(items.slice(mid))};
}
export function assertSimpleRing(points){
 const n=points.length-1,segments=[];
 for(let i=0;i<n;i++){
  const a=points[i],b=points[i+1];
  if(a[0]===b[0]&&a[1]===b[1])throw Error('Invalid topology: zero-length polygon edge');
  segments.push({i,points:[a,b],minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])});
 }
 const tree=build(segments.slice());
 for(const s of segments){
  const stack=[tree];
  while(stack.length){
   const node=stack.pop();if(!overlaps(s,node))continue;
   if(node.items){
    for(const t of node.items){
     if(t.i<=s.i+1||s.i===0&&t.i===n-1||!overlaps(s,t))continue;
     if(intersects(s,t))throw Error(`Invalid topology: self-intersecting polygon ring edges ${s.i}, ${t.i}`);
    }
   }else stack.push(node.left,node.right);
  }
 }
}

function ringSegments(points){
 const segments=[];
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1];
  segments.push({i,points:[a,b],minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])});
 }
 return segments;
}
// Detect intersections between distinct rings with a BVH; touching boundaries
// are rejected too. The caller supplies already unwrapped coordinates.
export function assertDisjointRingBoundaries(outer,hole){
 const outerSegments=ringSegments(outer);
 const tree=build(outerSegments.slice());
 let outerMin=Infinity,outerMax=-Infinity,holeMin=Infinity,holeMax=-Infinity;
 for(const [x] of outer){outerMin=Math.min(outerMin,x);outerMax=Math.max(outerMax,x)}
 for(const [x] of hole){holeMin=Math.min(holeMin,x);holeMax=Math.max(holeMax,x)}
 const outerMid=(outerMin+outerMax)/2,holeMid=(holeMin+holeMax)/2;
 const shift=360*Math.round((outerMid-holeMid)/360);
 for(const offset of [shift-360,shift,shift+360]){
  const translated=hole.map(([x,y])=>[x+offset,y]);
  for(const s of ringSegments(translated)){
   const stack=[tree];
   while(stack.length){
    const node=stack.pop();if(!overlaps(s,node))continue;
    if(node.items){
     for(const t of node.items)if(overlaps(s,t)&&intersects(s,t))
      throw Error(`Invalid topology: polygon hole crosses or touches outer ring (outer edge ${t.i}, inner edge ${s.i}, longitude shift ${offset})`);
    }else stack.push(node.left,node.right);
   }
  }
 }
}
