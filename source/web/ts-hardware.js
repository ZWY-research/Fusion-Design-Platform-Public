import * as THREE from 'three';

const up = new THREE.Vector3(0, 0, 1);
const clampZ = .207;
const outputZ = .446;
const portZ = .423;
const portXs = [.18, .02, -.15];
const portY = -.085;

const metal = (color, roughness = .32) => new THREE.MeshStandardMaterial({color, metalness:.82, roughness});
const finishes = () => ({
  steel:metal(0x8e9da6), polished:metal(0xc0c9ce, .23), dark:metal(0x27363f, .42),
  black:metal(0x17242a, .54), frame:metal(0x637884, .39), connector:metal(0xb49e7f),
});

function add(parent, name, geometry, finish, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, finish);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = !finish.transparent;
  mesh.receiveShadow = !finish.transparent;
  parent.add(mesh);
  return mesh;
}

function box(parent, name, length, width, height, finish, x = 0, y = 0, z = 0) {
  return add(parent, name, new THREE.BoxGeometry(length, width, height), finish, x, y, z);
}

// The profiles are given as [axial position, radius], along local +Z.
function turned(parent, name, profile, finish, segments = 48) {
  const geometry = new THREE.LatheGeometry(profile.map(([z, r]) => new THREE.Vector2(r, z)), segments);
  geometry.rotateX(Math.PI / 2);
  return add(parent, name, geometry, finish);
}

function sleeve(parent, name, inner, outer, from, to, finish, segments) {
  const bevel = Math.min(.003, (to - from) / 3, (outer - inner) / 2);
  return turned(parent, name, [[from, inner], [from, outer - bevel], [from + bevel, outer],
    [to - bevel, outer], [to, outer - bevel], [to, inner], [from, inner]], finish, segments);
}

function opticFrame(optic, name) {
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(optic.center);
  group.setRotationFromMatrix(new THREE.Matrix4().makeBasis(optic.u, optic.v, optic.normal));
  return group;
}

function glass(color, opacity) {
  return new THREE.MeshPhysicalMaterial({color, transparent:true, opacity, depthWrite:false,
    roughness:.17, clearcoat:.5, clearcoatRoughness:.19, envMapIntensity:.65, specularIntensity:.55});
}

function viewportFlange(window, shellDepth, finish) {
  const group = opticFrame(window, 'Vacuum viewport');
  const r = window.diameter / 2;
  const joint = -Math.min(window.depth, Math.max(0, shellDepth ?? window.depth));
  const neckEnd = -Math.min(window.depth, .024);
  sleeve(group, 'Weld neck and port bore', 1.02*r, 1.12*r, -window.depth, .006, finish.dark);
  sleeve(group, 'Shell-side mounting collar', 1.11*r, 1.29*r, joint - .009, joint + .009, finish.steel);
  sleeve(group, 'Backing flange', 1.11*r, 1.43*r, neckEnd - .016, neckEnd, finish.steel);
  sleeve(group, 'Flange seam', 1.11*r, 1.41*r, neckEnd, neckEnd + .009, finish.black);
  sleeve(group, 'Bolted flange', r, 1.48*r, neckEnd + .009, .017, finish.steel);
  sleeve(group, 'Viewport retaining ring', r, 1.12*r, .017, .031, finish.steel);
  turned(group, 'Flat window glass', [[-.008,0],[-.008,.98*r],[-.006,r],[.006,r],[.008,.98*r],[.008,0]],
    glass(0x6496a5, .71));
  for (let i = 0; i < 8; i++) {
    const angle = (i + .5) * Math.PI / 4;
    const screw = sleeve(group, 'Recessed socket head', .032*r, .077*r, .016, .028, finish.polished, 6);
    screw.position.set(1.30*r*Math.cos(angle), 1.30*r*Math.sin(angle), 0);
  }
  return group;
}

function focusGrip(group, r, finish) {
  const section = new THREE.Shape().moveTo(1.31*r, 0);
  for (let i = 1; i < 96; i++) {
    const angle = i * Math.PI / 48;
    const radius = (i % 4 === 0 || i % 4 === 3 ? 1.31 : 1.37) * r;
    section.lineTo(radius*Math.cos(angle), radius*Math.sin(angle));
  }
  section.closePath();
  section.holes.push(new THREE.Path().absarc(0, 0, 1.16*r, 0, Math.PI*2, true));
  add(group, 'Fluted focus collar', new THREE.ExtrudeGeometry(section,
    {depth:.067, bevelEnabled:false, curveSegments:24}), finish, 0, 0, .092);
}

function lensBarrel(lens, color, finish) {
  const group = opticFrame(lens, 'Collection lens and barrel');
  const r = lens.diameter / 2;
  sleeve(group, 'Lens cell', 1.11*r, 1.24*r, -.028, .081, finish.dark);
  sleeve(group, 'Beveled front rim', r, 1.34*r, -.031, -.013, finish.polished);
  sleeve(group, 'Recessed glass seat', r, 1.08*r, -.013, .018, finish.black);
  const face = Array.from({length:9}, (_, i) => {
    const theta = i*Math.PI/16;
    return [-.009 - .009*Math.cos(theta), r*Math.sin(theta)];
  });
  turned(group, 'Curved front element', [...face, ...face.toReversed().map(([z, radius]) => [-z, radius])],
    glass(0x51889a, .84));
  sleeve(group, 'Recessed glass retainer', r, 1.13*r, .028, .055, finish.black);
  sleeve(group, 'Lens barrel', 1.04*r, 1.21*r, .073, .24, finish.dark);
  sleeve(group, 'Index ring', 1.20*r, 1.32*r, .076, .088, metal(color, .39));
  focusGrip(group, r, finish.black);
  sleeve(group, 'Focus lock ring', 1.20*r, 1.30*r, .158, .177, finish.polished);
  sleeve(group, 'Mounting clamp', 1.20*r, 1.36*r, clampZ - .018, clampZ + .018, finish.steel);
  turned(group, 'Stepped rear housing', [[.236,0],[.236,1.12*r],[.255,1.12*r],[.267,1.04*r],
    [.314,1.04*r],[.349,.65*r],[.386,.65*r],[.394,.55*r],[.394,0]], finish.dark);
  sleeve(group, 'Rear coupling shoulder', .16*r, .68*r, .378, .403, finish.polished);
  sleeve(group, 'Fibre adapter locknut', .15*r, .46*r, .403, .432, finish.connector, 6);
  sleeve(group, 'Fibre adapter socket', .13*r, .33*r, .432, outputZ, finish.steel);
  return group;
}

function clampSeat(lens) {
  const r = lens.diameter / 2;
  const seat = lens.center.clone().addScaledVector(lens.normal, clampZ);
  seat.z -= 1.36*r*lens.v.z + .045;
  return seat;
}

function crossmember(parent, name, from, to, width, height, finish) {
  const delta = to.clone().sub(from);
  const middle = from.clone().lerp(to, .5);
  const rail = box(parent, name, delta.length() + width, width, height, finish, ...middle);
  rail.rotation.z = Math.atan2(delta.y, delta.x);
}

function adjustmentStage(group, lens, posts, finish) {
  const pivot = clampSeat(lens);
  const along = new THREE.Vector3(lens.u.y, -lens.u.x, 0);
  const stage = new THREE.Group();
  stage.name = 'Saddle and adjustment stage';
  stage.rotation.z = Math.atan2(along.y, along.x);
  group.worldToLocal(stage.position.copy(pivot));
  // The optical frame rotates with pitch; the stage stays level in world Z.
  stage.quaternion.premultiply(group.quaternion.clone().invert());
  group.add(stage);
  const r = lens.diameter / 2;
  const width = Math.max(.23, 2.9*r);
  box(stage, 'Adjustment tray', .31, width, .022, finish.steel);
  box(stage, 'Saddle block', .084, 1.88*r, .041, finish.dark, 0, 0, .031);
  for (const side of [-1, 1]) {
    const y = side * width * .41;
    box(stage, 'Dovetail rail', .28, .03, .019, finish.frame, 0, y, -.019);
    const jack = sleeve(stage, 'Leveling screw', 0, .013, .010, .055, finish.polished, 12);
    jack.position.set(.058, y, 0);
    const head = sleeve(stage, 'Leveling screw head', .004, .021, .053, .063, finish.black, 20);
    head.position.copy(jack.position);
  }
  const braces = new THREE.Group();
  braces.name = 'Cantilever arms';
  for (const [i, post] of posts.entries()) {
    const start = pivot.clone().addScaledVector(along, i === 0 ? -.103 : .103);
    start.z -= .045;
    const end = post.clone().setZ(start.z);
    crossmember(braces, 'Rack crossmember', start, end, .043, .042, finish.frame);
  }
  // Attach the world-aligned arms to the same selectable and hideable lens assembly.
  group.updateMatrixWorld(true);
  group.attach(braces);
}

function collectionRack(lenses, floorZ, finish) {
  const rack = new THREE.Group();
  rack.name = 'Floor-mounted collection rack';
  const middle = lenses[1];
  const along = new THREE.Vector3(middle.u.y, -middle.u.x, 0);
  const posts = [-.122, .141].map(offset => clampSeat(middle).addScaledVector(along, offset)
    .addScaledVector(middle.u, Math.max(.24, 1.8*middle.diameter)));
  const levels = lenses.map(lens => clampSeat(lens).z - .045);
  const bottom = Math.min(floorZ, ...levels.map(z => z - .12));
  const top = Math.max(...levels) + .04;
  for (const post of posts) {
    box(rack, 'Anchor shoe', .16, .13, .024, finish.steel, post.x, post.y, bottom + .012);
    box(rack, 'Rack upright', .045, .049, top - bottom, finish.frame, post.x, post.y, (top + bottom)/2);
  }
  for (const z of [bottom + .10, ...levels]) {
    crossmember(rack, 'Rack tie', posts[0].clone().setZ(z), posts[1].clone().setZ(z), .039, .044, finish.frame);
  }
  return {rack, posts};
}

function port(center, index) {
  return center.clone().add(new THREE.Vector3(portXs[index], portY, portZ));
}

function spectrometer(center, floorZ, colors) {
  const group = new THREE.Group();
  group.name = 'Spectrometer';
  group.position.copy(center);
  const finish = finishes();
  box(group, 'Instrument enclosure', .72, .51, .60, finish.steel);
  box(group, 'Front panel', .65, .022, .50, finish.dark, 0, -.254);
  box(group, 'Top plate', .74, .53, .040, finish.frame, 0, 0, .312);
  box(group, 'Fibre bulkhead', .53, .14, .025, finish.dark, .01, portY, .332);
  box(group, 'Display', .48, .019, .047, metal(0x879aa5, .39), 0, -.270, .144);
  for (let i = 0; i < 11; i++) {
    box(group, 'Recessed ventilation slot', .021, .013, .12, finish.black, -.21 + i*.041, -.270, -.084);
  }
  const base = Math.min(-.38, floorZ - center.z);
  box(group, 'Rack platform', .76, .56, .035, finish.dark, 0, 0, -.310);
  for (const x of [-.29, .29]) for (const y of [-.205, .205]) {
    box(group, 'Enclosure rack leg', .046, .046, -.31 - base, finish.frame, x, y, (base - .31)/2);
    box(group, 'Enclosure anchor shoe', .128, .112, .026, finish.steel, x, y, base + .013);
  }
  for (const [i, color] of colors.entries()) {
    const socket = new THREE.Group();
    socket.position.copy(port(center, i).sub(center));
    sleeve(socket, 'Bulkhead socket base', .012, .038, -.080, -.040, finish.steel, 6);
    sleeve(socket, 'Channel ID band', .013, .030, -.040, -.028, metal(color, .39));
    sleeve(socket, 'Bulkhead connector', .013, .026, -.028, 0, finish.polished);
    group.add(socket);
  }
  return group;
}

function strainRelief(group, point, axis, finish, jacket) {
  const plug = new THREE.Group();
  plug.position.copy(point);
  plug.quaternion.setFromUnitVectors(up, axis);
  sleeve(plug, 'Plug ferrule', .008, .022, 0, .025, finish, 12);
  turned(plug, 'Tapered strain relief', [[.023,0],[.023,.018],[.051,.017],[.092,.010],[.092,0]], jacket, 24);
  for (const z of [.044, .056, .068, .080]) {
    sleeve(plug, 'Strain relief rib', .008, .026 - z*.141, z, z + .005, jacket, 20);
  }
  group.add(plug);
}

function fibreLink(lens, receiver, index, color, finish) {
  const group = new THREE.Group();
  group.name = 'Fibre cable with end fittings';
  const start = lens.center.clone().addScaledVector(lens.normal, outputZ);
  const end = port(receiver, index);
  const bends = [
    [[-.22,.02,1.18],[.20,.01,.91]],
    [[-.28,-.095,.73]],
    [[-.48,-.08,.20],[-.48,-.08,.53],[-.36,-.07,.64]],
  ][index].map(offset => receiver.clone().add(new THREE.Vector3(...offset)));
  const curve = new THREE.CatmullRomCurve3([start, start.clone().addScaledVector(lens.normal, .15),
    ...bends, end.clone().addScaledVector(up, .15), end]);
  const jacket = new THREE.MeshStandardMaterial({color:new THREE.Color(color).lerp(new THREE.Color(0x232931), .28),
    roughness:.48});
  add(group, 'Flexible fibre jacket', new THREE.TubeGeometry(curve, 60, .010, 10, false), jacket);
  strainRelief(group, start, lens.normal, finish.connector, jacket);
  strainRelief(group, end, up, finish.steel, jacket);
  return group;
}

export function collectionHardware(groups, receiver, floorZ, colors) {
  const finish = finishes();
  const {rack, posts} = collectionRack(groups.map(group => group.lens), floorZ, finish);
  const channels = groups.map((g, i) => {
    const lens = lensBarrel(g.lens, colors[i], finish);
    adjustmentStage(lens, g.lens, posts, finish);
    return {
      window:viewportFlange(g.window, g.centerView.shellDepth, finish),
      lens,
      fibre:fibreLink(g.lens, receiver, i, colors[i], finish),
    };
  });
  return {rack, spectrometer:spectrometer(receiver, floorZ, colors), channels};
}
