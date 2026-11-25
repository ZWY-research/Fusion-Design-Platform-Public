import * as THREE from 'three';

const toVector = ([r,z]) => new THREE.Vector3(r,0,z);

// Display only. The transfer function uses the same cell values and palette as Plotly.
export function makePrdSection(field, profiles, quantities, {animate=true} = {}) {
  const group = new THREE.Group(), flux = new THREE.Group();
  const {R,Z,plasmaBoundary,contours} = field;
  const outline = plasmaBoundary.map(toVector);
  const shape = new THREE.Shape(plasmaBoundary.map(([r,z]) => new THREE.Vector2(r,z)));
  const backing = new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:0x241e37,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:2}));
  backing.rotation.x = Math.PI/2;
  group.add(backing);
  group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline),new THREE.LineBasicMaterial({color:0x87e9df})));
  for (const {level,lines} of contours) {
    if (level >= 1) continue;
    for (const path of lines) {
      const points = path.map(([r,z])=>new THREE.Vector3(r,-.002,z));
      flux.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xffeee3,transparent:true,opacity:.48,depthWrite:false})));
    }
  }
  group.add(flux);

  const cells=[], positions=[];
  for (const [j,row] of profiles.mapping.cells.entries()) {
    for (const [i,value] of row.entries()) {
      if (value===null) continue;
      const a=[R[i],0,Z[j]], b=[R[i+1],0,Z[j]], c=[R[i+1],0,Z[j+1]], d=[R[i],0,Z[j+1]];
      positions.push(...a,...b,...c,...a,...c,...d);
      cells.push({a,c,value});
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const vertexColors = new THREE.Float32BufferAttribute(new Float32Array(positions.length),3);
  geometry.setAttribute('color',vertexColors);
  const surface = new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false}));
  group.add(surface);

  const size=32, textureCanvas=document.createElement('canvas');
  textureCanvas.width=textureCanvas.height=size;
  const context=textureCanvas.getContext('2d'), gradient=context.createRadialGradient(16,16,1,16,16,16);
  gradient.addColorStop(0,'#fff');gradient.addColorStop(.25,'#fffe');gradient.addColorStop(1,'#fff0');
  context.fillStyle=gradient;context.fillRect(0,0,size,size);
  const sprite=new THREE.CanvasTexture(textureCanvas);
  const particles=animate?cells.filter((_,i)=>i%4===0):[];
  const particleGeometry=new THREE.BufferGeometry();
  const xyz=new THREE.Float32BufferAttribute(new Float32Array(3*particles.length),3);
  particleGeometry.setAttribute('position',xyz);
  const points=new THREE.Points(particleGeometry,new THREE.PointsMaterial({map:sprite,color:0xfff0c4,size:.038,transparent:true,depthWrite:false,opacity:.85,blending:THREE.AdditiveBlending}));
  points.frustumCulled=false;
  group.add(points);
  const frame=time=>{
    particles.forEach(({a,c},i)=>{
      const phase=time*.00074+i*2.39996;
      xyz.setXYZ(i,THREE.MathUtils.lerp(a[0],c[0],.5+.38*Math.cos(phase)),-.012,
        THREE.MathUtils.lerp(a[2],c[2],.5+.38*Math.sin(phase)));
    });
    points.material.opacity=.74+.13*Math.sin(time*.00115);
    xyz.needsUpdate=true;
  };
  frame(0);
  function quantity(index) {
    const {label,unit,scale,colors}=quantities[index];
    const values=cells.map(({value})=>value[index]/scale);
    const finite=values.filter((_,i)=>Number.isFinite(cells[i].value[index]));
    const min=Math.min(...finite), max=Math.max(...finite);
    const palette=colors.map(rgb=>new THREE.Color(`rgb(${rgb.join(',')})`));
    const color=new THREE.Color();
    const indices=[];
    values.forEach((value,i)=>{
      if (!Number.isFinite(cells[i].value[index])) return;
      const stops=palette.length-1;
      const t=max===min?stops/2:(value-min)/(max-min)*stops, lo=Math.min(Math.floor(t),stops-1);
      color.copy(palette[lo]).lerp(palette[lo+1],t-lo);
      for(let corner=0;corner<6;corner++) {
        const vertex=i*6+corner;
        vertexColors.setXYZ(vertex,color.r,color.g,color.b);
        indices.push(vertex);
      }
    });
    if (indices.length!==positions.length/3 || geometry.index) geometry.setIndex(indices);
    vertexColors.needsUpdate=true;
    return {label,unit,min,max,colors};
  }
  quantity(0);
  return {group,flux,points,frame,quantity,dispose:()=>sprite.dispose()};
}
