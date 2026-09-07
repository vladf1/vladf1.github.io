import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BONUS_SECONDS, SIZE, type Cell, type GameEvent, type Simulation } from './simulation.ts';

const MINT = 0x65e9ae, CORAL = 0xff526f, GOLD = 0xffbf45;
const MAX_RINGS = SIZE * SIZE * 8 + 2;
const BODY_SIDES = 12;
const MAX_DEBRIS = 160;
const DEBRIS_LIFETIME = 2.4;
const DEBRIS_FADE_SECONDS = .9;
const RING_VERTICES = BODY_SIDES + 1;
const world = (c: Cell) => new THREE.Vector3(c.x - 9.5, .42, c.y - 9.5);
type Particle = { position: THREE.Vector3; velocity: THREE.Vector3; life: number; maxLife: number; color: THREE.Color; size: number };
type Debris = { position: THREE.Vector3; velocity: THREE.Vector3; rotation: THREE.Vector3; spin: THREE.Vector3; size: THREE.Vector3; life: number; color: THREE.Color };
type Ring = { mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>; life: number; maxLife: number };

export class ArenaRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-15, 15, 12, -12, .1, 150);
  private snakeGeometry = new THREE.BufferGeometry();
  private snakeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: 0 });
  private snake: THREE.Mesh;
  private shadow: THREE.Mesh;
  private head = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private tongue = new THREE.Group();
  private food = new THREE.Group();
  private gold = new THREE.Group();
  private goldTimer: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private foodHalo: THREE.Mesh;
  private goldHalo: THREE.Mesh;
  private light = new THREE.PointLight(CORAL, 0, 6, 2);
  private particles: Particle[] = [];
  private particleMesh: THREE.InstancedMesh;
  private debrisMesh: THREE.InstancedMesh<THREE.DodecahedronGeometry, THREE.MeshStandardMaterial>;
  private debris: Debris[] = [];
  private debrisAge = 0;
  private exploded = false;
  private rings: Ring[] = [];
  private matrix = new THREE.Object3D();
  private positionArray = new Float32Array(MAX_RINGS * RING_VERTICES * 3);
  private normalArray = new Float32Array(MAX_RINGS * RING_VERTICES * 3);
  private colorArray = new Float32Array(MAX_RINGS * RING_VERTICES * 3);
  private uvArray = new Float32Array(MAX_RINGS * RING_VERTICES * 2);
  private snakeColor = new THREE.Color();
  private cameraShake = 0;
  private tongueTime = 0;
  private angle = Math.PI / 2;
  private time = 0;
  private slitherTime = 0;
  private reduced = false;
  private effects = true;
  private demoPath: Cell[] = [];
  private previousDemo: Cell[] = [];
  private demoClock = 0;
  private demoIndex = 0;
  private demoRoute: Cell[] = [];
  private pop = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.setAttribute('aria-label', 'Twenty by twenty Snake arena. Use arrow keys, WASD, swipe, or the direction pad to steer.');
    this.renderer.domElement.setAttribute('role', 'img');
    container.append(this.renderer.domElement);
    this.camera.position.set(0, 30, 18);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xc9f7ef, 0x16384b, 1.5));
    const key = new THREE.DirectionalLight(0xe9f5e7, 2.4); key.position.set(-8, 20, 8); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x5fe3dc, 1.7); rim.position.set(8, 7, -10); this.scene.add(rim);
    this.scene.add(this.light);
    this.buildArena();
    this.snakeGeometry.setAttribute('position', new THREE.BufferAttribute(this.positionArray, 3).setUsage(THREE.DynamicDrawUsage));
    this.snakeGeometry.setAttribute('normal', new THREE.BufferAttribute(this.normalArray, 3).setUsage(THREE.DynamicDrawUsage));
    this.snakeGeometry.setAttribute('color', new THREE.BufferAttribute(this.colorArray, 3).setUsage(THREE.DynamicDrawUsage));
    this.snakeGeometry.setAttribute('uv', new THREE.BufferAttribute(this.uvArray, 2).setUsage(THREE.DynamicDrawUsage));
    const skin = this.buildSkin();
    this.snakeMaterial.map = skin.color;
    this.snakeMaterial.bumpMap = skin.height;
    this.snakeMaterial.bumpScale = .024;
    this.snakeMaterial.roughnessMap = skin.roughness;
    const debrisMaterial = this.snakeMaterial.clone();
    debrisMaterial.vertexColors = false;
    debrisMaterial.transparent = true; debrisMaterial.depthWrite = false;
    this.debrisMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1), debrisMaterial, MAX_DEBRIS);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.count = 0; this.debrisMesh.frustumCulled = false;
    this.scene.add(this.debrisMesh);
    const indices = [];
    for (let i = 0; i < MAX_RINGS - 1; i++) for (let j = 0; j < BODY_SIDES; j++) {
      const a = i * RING_VERTICES + j, b = a + RING_VERTICES;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    this.snakeGeometry.setIndex(indices);
    this.snake = new THREE.Mesh(this.snakeGeometry, this.snakeMaterial); this.snake.frustumCulled = false;
    this.shadow = new THREE.Mesh(this.snakeGeometry, new THREE.MeshBasicMaterial({ color: 0x00060c, transparent: true, opacity: .4, depthWrite: false }));
    this.shadow.scale.set(1, .015, 1); this.shadow.position.y = .025; this.shadow.frustumCulled = false;
    this.scene.add(this.shadow, this.snake, this.head);
    this.buildHead(skin);
    this.foodHalo = this.halo(CORAL, 1.6); this.goldHalo = this.halo(GOLD, 2.4);
    this.buildFood();
    this.goldTimer = new THREE.Mesh(new THREE.TorusGeometry(.75, .025, 5, 64), new THREE.MeshBasicMaterial({ color: GOLD }));
    // TorusGeometry groups triangles by radial band. Reorder by angular segment
    // so drawRange removes a wedge, rather than peeling the tube's surface.
    const timerIndices = this.goldTimer.geometry.index!.array;
    const ordered: number[] = [];
    for (let angle = 0; angle < 64; angle++) for (let radial = 0; radial < 5; radial++) {
      const offset = (radial * 64 + angle) * 6;
      for (let vertex = 0; vertex < 6; vertex++) ordered.push(timerIndices[offset + vertex]);
    }
    this.goldTimer.geometry.setIndex(ordered);
    this.goldTimer.rotation.x = Math.PI / 2; this.goldTimer.position.y = .07;
    this.scene.add(this.food, this.gold, this.foodHalo, this.goldHalo, this.goldTimer);
    this.particleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 200);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.particleMesh.count = 0; this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, .024, 4, 48), new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: 0, depthWrite: false }));
      mesh.rotation.x = Math.PI / 2; mesh.visible = false; this.scene.add(mesh);
      this.rings.push({ mesh, life: 0, maxLife: .65 });
    }
    this.buildDemo();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }
  private buildSkin() {
    const canvases = Array.from({ length: 3 }, () => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512; return canvas;
    });
    const [color, height, roughness] = canvases.map(canvas => canvas.getContext('2d')!);
    const contexts = [color, height, roughness];
    ['#61734a', '#414141', '#dedede'].forEach((fill, i) => {
      contexts[i].fillStyle = fill; contexts[i].fillRect(0, 0, 512, 512);
    });
    // Overlapping, keeled scales. Broad enough for their seams to survive
    // minification at the full-arena camera distance. All maps tile.
    const width = 512 / 12;
    for (let row = -1; row <= 8; row++) for (let column = -1; column <= 12; column++) {
      const x = column * width + (row & 1) * width / 2, y = row * 64;
      const r = (row + 8) % 8, c = (column + 12) % 12;
      const variation = ((r * 47 + c * 31 + r * c * 13) % 17) - 8;
      for (const ctx of contexts) {
        ctx.beginPath(); ctx.moveTo(x, y + 43);
        ctx.bezierCurveTo(x - 7, y + 36, x - 24, y + 10, x - 23, y - 12);
        ctx.bezierCurveTo(x - 22, y - 39, x + 22, y - 39, x + 23, y - 12);
        ctx.bezierCurveTo(x + 24, y + 10, x + 7, y + 36, x, y + 43);
        const gradient = ctx.createLinearGradient(x - 20, y - 21, x + 17, y + 32);
        if (ctx === color) {
          gradient.addColorStop(0, `hsl(83 27% ${61 + variation}%)`);
          gradient.addColorStop(.43, `hsl(78 51% ${85 + variation / 2}%)`);
          gradient.addColorStop(.64, `hsl(82 37% ${74 + variation / 2}%)`);
          gradient.addColorStop(1, `hsl(91 29% ${52 + variation}%)`);
        } else if (ctx === height) {
          gradient.addColorStop(0, '#656565'); gradient.addColorStop(.45, '#dedede');
          gradient.addColorStop(.62, '#b9b9b9'); gradient.addColorStop(1, '#707070');
        } else {
          gradient.addColorStop(0, '#c8c8c8'); gradient.addColorStop(.45, '#777777');
          gradient.addColorStop(.65, '#969696'); gradient.addColorStop(1, '#bdbdbd');
        }
        ctx.fillStyle = gradient; ctx.fill();
        ctx.strokeStyle = ctx === color ? '#687e47' : ctx === height ? '#414141' : '#dedede';
        ctx.lineWidth = 2.8; ctx.stroke();
      }
      // A narrow ridge down each scale breaks the highlight into small facets.
      for (const ctx of [color, height]) {
        ctx.beginPath(); ctx.moveTo(x - 1, y - 18); ctx.quadraticCurveTo(x + 2, y + 3, x, y + 27);
        ctx.strokeStyle = ctx === color ? 'rgba(240,255,194,.45)' : '#eeeeee';
        ctx.lineWidth = ctx === color ? 1.8 : 2.6; ctx.stroke();
      }
    }
    // Broad transverse belly plates are separate from the smaller dorsal scales.
    for (const ctx of contexts) {
      ctx.fillStyle = ctx === color ? '#e2e6bc' : ctx === height ? '#aaaaaa' : '#bbbbbb';
      ctx.fillRect(292, 0, 184, 512);
      ctx.strokeStyle = ctx === color ? '#a6b47e' : ctx === height ? '#707070' : '#dddddd'; ctx.lineWidth = 3;
      for (let y = 0; y <= 512; y += 32) { ctx.beginPath(); ctx.moveTo(292, y); ctx.lineTo(476, y); ctx.stroke(); }
    }
    const [colorTexture, heightTexture, roughnessTexture] = canvases.map(canvas => {
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      return texture;
    });
    colorTexture.colorSpace = THREE.SRGBColorSpace;
    return { color: colorTexture, height: heightTexture, roughness: roughnessTexture };
  }
  private material(color: number, roughness = .4, metalness = .2) { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
  private box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, radius = .1) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, radius), this.material(color));
    mesh.position.set(x, y, z); this.scene.add(mesh); return mesh;
  }
  private halo(color: number, size: number) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,.38)'); gradient.addColorStop(.28, 'rgba(255,255,255,.14)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: texture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = .03;
    return mesh;
  }
  private buildArena() {
    const glow = this.halo(0x3eb9ac, 34); glow.position.y = -1.1; this.scene.add(glow);
    this.box(21.5, .8, 21.5, 0x12232d, 0, -.64, 0, .3);
    this.box(21.7, .15, 21.7, 0x1b3b44, 0, -.96, 0, .16);
    this.box(20.55, .16, 20.55, 0x264d54, 0, -.17, 0, .16);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv; void main(){vec2 p=vUv*20.;vec2 g=abs(fract(p-.5)-.5)/fwidth(p);float line=1.-min(min(g.x,g.y),1.);float edge=pow(max(abs(vUv.x-.5),abs(vUv.y-.5))*2.,4.);float checker=mod(floor(p.x)+floor(p.y),2.);vec3 base=mix(vec3(.043,.090,.105),vec3(.052,.112,.124),checker*.25);base+=line*vec3(.025,.050,.054);base+=edge*vec3(.005,.02,.024);gl_FragColor=vec4(base,1.);}`
    }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.035; this.scene.add(floor);
    const border = new THREE.MeshBasicMaterial({ color: 0x4eb6ac, transparent: true, opacity: .65 });
    for (const side of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(20.45, .035, .035), border); a.position.set(0, .02, side * 10.22);
      const b = new THREE.Mesh(new THREE.BoxGeometry(.035, .035, 20.45), border); b.position.set(side * 10.22, .02, 0);
      this.scene.add(a, b);
      const under = new THREE.Mesh(new THREE.BoxGeometry(16, .028, .035), new THREE.MeshBasicMaterial({ color: 0x71dec7 }));
      under.position.set(0, -.68, side * 10.76); this.scene.add(under);
    }
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      this.box(.38, .15, 1.0, 0x80bfac, x * 10.4, .03, z * 10.05, .04);
      this.box(1.0, .15, .38, 0x80bfac, x * 10.05, .03, z * 10.4, .04);
      const light = new THREE.Mesh(new THREE.BoxGeometry(.19, .018, .48), new THREE.MeshBasicMaterial({ color: 0xbcffe2 }));
      light.position.set(x * 10.4, .12, z * 10.14); this.scene.add(light);
    }
    // Quiet calibration marks give the board a crafted, arcade-machine feel.
    const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(.035, .01, .13), new THREE.MeshBasicMaterial({ color: 0x63948e }), 40);
    for (let i = 0; i < 40; i++) { this.matrix.position.set((i % 20) - 9.5, -.05, i < 20 ? -10.46 : 10.46); this.matrix.updateMatrix(); marks.setMatrixAt(i, this.matrix.matrix); }
    this.scene.add(marks);
  }
  private buildHead(skin: { color: THREE.CanvasTexture; height: THREE.CanvasTexture; roughness: THREE.CanvasTexture }) {
    const headColor = skin.color.clone(), headHeight = skin.height.clone(), headRoughness = skin.roughness.clone();
    for (const texture of [headColor, headHeight, headRoughness]) texture.repeat.set(.5, .45);
    const skullGeometry = new THREE.SphereGeometry(1, 32, 20);
    const positions = skullGeometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3), shade = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      // A low, elongated head, broad behind the eyes and rounded at the snout.
      positions.setXYZ(i, x * .325 * (1 - .32 * Math.max(0, z)), y * .19 * (1 - .22 * Math.max(0, z)), z * .54);
      shade.setHex(y < -.28 ? 0xd1df83 : 0x42cf19);
      colors.set([shade.r, shade.g, shade.b], i * 3);
    }
    skullGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); skullGeometry.computeVertexNormals();
    const skullMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: 0, map: headColor, bumpMap: headHeight, bumpScale: .018, roughnessMap: headRoughness });
    this.head.add(new THREE.Mesh(skullGeometry, skullMaterial));
    const lipPoints = [
      [-.28, -.053, -.13], [-.275, -.058, .08], [-.205, -.062, .32], [-.115, -.061, .46],
      [0, -.057, .514], [.115, -.061, .46], [.205, -.062, .32], [.275, -.058, .08], [.28, -.053, -.13],
    ].map(([x,y,z]) => new THREE.Vector3(x,y,z));
    const mouth = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lipPoints), 32, .0055, 4, false), this.material(0x3a591f, .65, 0));
    this.head.add(mouth);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.091, 16, 12), this.material(0x9faf43, .23, 0));
      eye.position.set(side * .258, .065, .17); eye.scale.set(.6, .86, 1); this.head.add(eye); this.eyes.push(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(.064, 16, 12), this.material(0x081008, .1, 0));
      pupil.position.set(side * .075, .014, .012); pupil.scale.x = .45; eye.add(pupil);
      const sparkle = new THREE.Mesh(new THREE.SphereGeometry(.01, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf4ffe2 }));
      sparkle.position.set(side * .048, .028, .018); pupil.add(sparkle);
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(.012, 8, 6), this.material(0x2c471a));
      nostril.position.set(side * .09, .035, .49); nostril.scale.y = .55; this.head.add(nostril);
    }
    const tongueMaterial = this.material(0x542c42, .48, 0);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(.018, .008, .26), tongueMaterial); stem.position.z = .62; this.tongue.add(stem);
    for (const side of [-1, 1]) {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(.01, .008, .12), tongueMaterial);
      fork.position.set(side * .024, 0, .79); fork.rotation.y = side * .45; this.tongue.add(fork);
    }
    this.tongue.position.y = -.055; this.head.add(this.tongue);
  }
  private buildFood() {
    const berryMaterial = this.material(CORAL, .25, .14);
    const berry = new THREE.Mesh(new THREE.SphereGeometry(.35, 20, 16), berryMaterial); berry.scale.set(1, 1.12, 1); this.food.add(berry);
    const dimple = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), this.material(0xa83254)); dimple.position.y = .35; dimple.scale.y = .4; this.food.add(dimple);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.025, .04, .19, 6), this.material(0xa2d991)); stem.position.set(.025, .43, 0); stem.rotation.z = -.22; this.food.add(stem);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), this.material(0x9de4b0)); leaf.scale.set(.19, .035, .075); leaf.rotation.z = .4; leaf.position.set(.18, .46, 0); this.food.add(leaf);
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? .24 : .51; const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius; if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y); }
    shape.closePath();
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .15, bevelEnabled: true, bevelThickness: .06, bevelSize: .055, bevelSegments: 2, steps: 1 }), this.material(GOLD, .22, .65));
    star.position.z = -.075; this.gold.add(star);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(.16), new THREE.MeshStandardMaterial({ color: 0xffefb2, emissive: 0xffaa35, emissiveIntensity: .3, roughness: .2, metalness: .5 }));
    core.position.z = .20; this.gold.add(core);
  }
  private buildDemo() {
    // The title snake glides through relaxed curves. Gameplay still uses exact
    // cardinal movement; this presentation path never enters the simulation.
    const points = [[3,6],[8,3],[15,4],[16,9],[12,12],[7,9],[5,12],[9,16],[16,15],[17,17],[10,18],[3,15],[2,10]];
    const curve = new THREE.CatmullRomCurve3(points.map(([x,y]) => new THREE.Vector3(x,0,y)), true, 'centripetal');
    const samples = Math.ceil(curve.getLength() * 4);
    this.demoRoute = curve.getSpacedPoints(samples).slice(0,-1).map(p => ({x:p.x,y:p.z}));
    this.demoIndex = Math.floor(samples * .57);
    this.demoPath = Array.from({ length: 100 }, (_, i) => ({ ...this.demoRoute[(this.demoIndex - i + this.demoRoute.length) % this.demoRoute.length] }));
    this.previousDemo = this.demoPath.map(c => ({ ...c }));
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    const aspect = width / height;
    // Fit the projected diorama with a little breathing room on every side.
    const viewHeight = Math.max(20.4, 23 / aspect);
    this.camera.left = -viewHeight * aspect / 2; this.camera.right = viewHeight * aspect / 2;
    this.camera.top = viewHeight / 2; this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }
  configure(effects: boolean, reduced: boolean) { this.effects = effects; this.reduced = reduced; }
  clear() {
    this.particles = []; this.cameraShake = this.pop = this.slitherTime = 0; this.light.intensity = 0;
    this.debris = []; this.debrisMesh.count = this.particleMesh.count = 0; this.exploded = false;
    this.debrisAge = 0; this.debrisMesh.material.opacity = 1;
    this.snake.visible = this.head.visible = this.shadow.visible = true;
    this.snakeMaterial.emissive.setHex(0x000000);
    this.rings.forEach(r => { r.life = 0; r.mesh.visible = false; });
  }
  event(event: GameEvent) {
    const color = event.type === 'bonus' || event.type === 'bonus-spawn' ? GOLD : event.type === 'death' ? CORAL : MINT;
    if (event.type === 'bonus-expired') return;
    if (event.type === 'death') this.explode();
    const strength = event.type === 'bonus' || event.type === 'death' || event.type === 'win' ? 2 : event.type === 'food' ? 1 + Math.min(2, (event.combo ?? 1) - 1) * .3 : 1;
    this.burst(event.cell, color, strength);
    if (event.type === 'food' || event.type === 'bonus') this.pop = .16;
    if (this.effects && !this.reduced) {
      if (event.type === 'death') this.cameraShake = .22;
      this.light.color.setHex(color); this.light.position.copy(world(event.cell)).y = 1.5; this.light.intensity = strength * 7;
    }
  }
  burst(cell: Cell, color: number, strength = 1) {
    const ring = this.rings.find(r => r.life <= 0) ?? this.rings[0];
    ring.life = ring.maxLife; ring.mesh.position.copy(world(cell)).y = .065;
    ring.mesh.material.color.setHex(color); ring.mesh.visible = true;
    if (this.reduced) return;
    const count = Math.min(200 - this.particles.length, (this.effects ? 16 : 6) * strength);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, speed = 1 + Math.random() * 2;
      this.particles.push({ position: world(cell), velocity: new THREE.Vector3(Math.cos(a) * speed, 1.2 + Math.random() * 2.5, Math.sin(a) * speed), life: .4 + Math.random() * .35, maxLife: .75, color: new THREE.Color(color), size: .035 + Math.random() * .045 });
    }
  }
  private explode() {
    if (this.exploded) return;
    this.exploded = true;
    this.debrisAge = 0; this.debrisMesh.material.opacity = 1;
    this.snake.visible = this.head.visible = this.shadow.visible = false;
    // Use the actual rendered body, so every piece starts where the snake was
    // visible, including its rounded corners and taper. Never allocate per cell.
    if (this.reduced) return;
    const rings = Math.floor(this.snakeGeometry.drawRange.count / (BODY_SIDES * 6)) + 1;
    const count = Math.min(MAX_DEBRIS, Math.max(24, rings * 2));
    const center = new THREE.Vector3(), edge = new THREE.Vector3();
    const colors = [0x65e32c, 0x3fbd18, 0x9bec48, 0xc7df87];
    for (let i = 0; i < count; i++) {
      const ring = Math.round(i / (count - 1) * (rings - 1));
      const first = ring * RING_VERTICES * 3, opposite = first + BODY_SIDES / 2 * 3;
      edge.fromArray(this.positionArray, first);
      center.fromArray(this.positionArray, opposite).add(edge).multiplyScalar(.5);
      const radius = Math.max(.035, edge.distanceTo(center));
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 4.5;
      const life = DEBRIS_LIFETIME - .6 + Math.random() * .6;
      const size = radius * (.55 + Math.random() * .4);
      this.debris.push({
        position: center.clone().add(new THREE.Vector3(Math.cos(angle) * radius * .3, .04, Math.sin(angle) * radius * .3)),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, 2.3 + Math.random() * 4, Math.sin(angle) * speed),
        rotation: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3(Math.random() * 18 - 9, Math.random() * 18 - 9, Math.random() * 18 - 9),
        size: new THREE.Vector3(size, size * .65, size * 1.25), life, color: new THREE.Color(colors[i % colors.length]),
      });
      this.debrisMesh.setColorAt(i, this.debris[i].color);
    }
    this.debrisMesh.count = count;
    this.debrisMesh.instanceColor!.needsUpdate = true;
  }
  private drawSnake(body: Cell[], previous: Cell[], alpha: number, dt: number, dead: boolean) {
    if (!dead) this.slitherTime += dt;
    const nodes: THREE.Vector3[] = [world(previous[0]).lerp(world(body[0]), alpha)];
    for (let i = 1; i < body.length; i++) {
      const v = world(body[i]); if (v.distanceToSquared(nodes.at(-1)!) > .00001) nodes.push(v);
    }
    if (body.length === previous.length) {
      const tail = world(previous.at(-1)!).lerp(world(body.at(-1)!), alpha);
      if (tail.distanceToSquared(nodes.at(-1)!) > .00001) nodes.push(tail);
    }
    // Round the tube only inside the occupied corner cell. The moving head and
    // tail still travel on cardinal segments, never diagonally between cells.
    const rounded: THREE.Vector3[] = [nodes[0]];
    for (let i = 1; i < nodes.length - 1; i++) {
      const a = nodes[i - 1], b = nodes[i], c = nodes[i + 1];
      const before = new THREE.Vector3().subVectors(a, b), after = new THREE.Vector3().subVectors(c, b);
      if (Math.abs(before.clone().normalize().dot(after.clone().normalize())) < .1) {
        const r = Math.min(.46, before.length() * .45, after.length() * .45);
        const start = b.clone().addScaledVector(before.normalize(), r), end = b.clone().addScaledVector(after.normalize(), r);
        rounded.push(start);
        for (let j = 1; j <= 6; j++) { const t = j / 6; rounded.push(start.clone().multiplyScalar((1-t)*(1-t)).addScaledVector(b, 2*(1-t)*t).addScaledVector(end, t*t)); }
      } else rounded.push(b);
    }
    rounded.push(nodes.at(-1)!);
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i < rounded.length - 1; i++) {
      const a = rounded[i], b = rounded[i + 1], count = Math.max(1, Math.ceil(a.distanceTo(b) * 4));
      for (let j = 0; j < count; j++) samples.push(new THREE.Vector3().lerpVectors(a, b, j / count));
    }
    samples.push(rounded.at(-1)!);
    const tangent = new THREE.Vector3();
    const rings = Math.min(MAX_RINGS, samples.length);
    const lengths = new Float32Array(rings);
    for (let i = 1; i < rings; i++) lengths[i] = lengths[i - 1] + samples[i].distanceTo(samples[i - 1]);
    const totalLength = Math.max(.001, lengths[rings - 1]);
    // Grow into the adult proportions from 4 to 18 cells. Use the interpolated
    // cell count so pickups smoothly add girth, and corners never change it.
    const visualLength = THREE.MathUtils.lerp(previous.length, body.length, alpha);
    const thickness = .65 + .35 * THREE.MathUtils.smoothstep(visualLength, 4, 18);
    if (!this.reduced) {
      // A tiny travelling bend gives straight runs a living, muscular motion.
      // The head and tail stay on their paths; the body shifts at most .035 cell.
      const offsets = new Float32Array(rings * 2);
      for (let i = 1; i < rings - 1; i++) {
        tangent.subVectors(samples[i + 1], samples[i - 1]).normalize();
        const envelope = Math.min(1, lengths[i] / 1.5) * Math.min(1, (totalLength - lengths[i]) / 1.5);
        const sway = .035 * envelope * Math.sin(lengths[i] * 1.7 - this.slitherTime * 5);
        offsets[i * 2] = -tangent.z * sway; offsets[i * 2 + 1] = tangent.x * sway;
      }
      for (let i = 1; i < rings - 1; i++) { samples[i].x += offsets[i * 2]; samples[i].z += offsets[i * 2 + 1]; }
    }
    for (let i = 0; i < rings; i++) {
      tangent.subVectors(samples[Math.min(rings - 1, i + 1)], samples[Math.max(0, i - 1)]).normalize();
      // Anatomical profile: narrower neck, rounded trunk, then a long tail.
      // Smooth joins avoid both a constant-width pipe and a head-to-tip wedge.
      const alongBody = lengths[i] / totalLength;
      const neck = alongBody < .22, trunk = alongBody < .66;
      const zoneLength = neck ? .22 : trunk ? .44 : .34;
      const u = neck ? alongBody / .22 : trunk ? (alongBody - .22) / .44 : (alongBody - .66) / .34;
      const smooth = u * u * (3 - 2 * u);
      const change = neck ? .09 : trunk ? -.02 : -.254;
      const radius = ((neck ? .19 : trunk ? .28 : .26) + change * smooth) * thickness;
      const radiusSlope = change * 6 * u * (1 - u) / (zoneLength * totalLength) * thickness;
      const neckLift = .06 * Math.exp(-lengths[i] * 3) * thickness;
      for (let j = 0; j <= BODY_SIDES; j++) {
        const a = j / BODY_SIDES * Math.PI * 2, nx = -tangent.z * Math.cos(a), ny = Math.sin(a), nz = tangent.x * Math.cos(a);
        const idx = (i * RING_VERTICES + j) * 3, uvIndex = (i * RING_VERTICES + j) * 2;
        this.positionArray[idx] = samples[i].x + nx * radius;
        this.positionArray[idx + 1] = .07 + radius * .90 + neckLift + ny * radius * .90;
        this.positionArray[idx + 2] = samples[i].z + nz * radius;
        this.normalArray[idx] = nx - tangent.x * radiusSlope; this.normalArray[idx + 1] = ny / .90; this.normalArray[idx + 2] = nz - tangent.z * radiusSlope;
        this.uvArray[uvIndex] = j / BODY_SIDES; this.uvArray[uvIndex + 1] = lengths[i] * .43;
        this.snakeColor.setHex(ny < -.2 ? 0xc7df87 : ny > .7 ? 0x32c615 : 0x4ed426);
        this.colorArray[idx] = this.snakeColor.r; this.colorArray[idx + 1] = this.snakeColor.g; this.colorArray[idx + 2] = this.snakeColor.b;
      }
    }
    this.snakeGeometry.setDrawRange(0, Math.max(0, (rings - 1) * BODY_SIDES * 6));
    for (const attribute of ['position', 'normal', 'color', 'uv']) {
      const attr = this.snakeGeometry.getAttribute(attribute) as THREE.BufferAttribute;
      attr.clearUpdateRanges(); attr.addUpdateRange(0, rings * RING_VERTICES * attr.itemSize); attr.needsUpdate = true;
    }
    this.head.position.copy(nodes[0]);
    this.head.position.y = .07 + .27 * thickness;
    let dx = body[0].x - previous[0].x, dz = body[0].y - previous[0].y;
    if (!dx && !dz) { dx = body[0].x - body[1].x; dz = body[0].y - body[1].y; }
    const target = Math.atan2(dx, dz);
    const diff = Math.atan2(Math.sin(target - this.angle), Math.cos(target - this.angle));
    this.angle += diff * Math.min(1, dt * 30);
    this.head.rotation.y = this.angle;
    this.head.scale.setScalar(thickness * (1 + this.pop * .15));
    // Snakes have transparent eye coverings rather than blinking eyelids.
    this.eyes.forEach(e => { (e.material as THREE.MeshStandardMaterial).color.setHex(dead ? 0x69732d : 0x9faf43); });
    this.tongueTime += dt;
    this.tongue.visible = !dead && !this.reduced && this.tongueTime % 3.6 < .24;
    this.tongue.scale.z = .85 + .15 * Math.sin(this.time * 60);
    this.snakeMaterial.emissive.setHex(dead ? 0x882b37 : 0x000000);
    this.snakeMaterial.emissiveIntensity = dead ? .35 : 0;
  }
  render(game: Simulation, dt: number, demo: boolean) {
    this.time += dt;
    const frozen = game.phase === 'paused';
    const effectDt = frozen ? 0 : dt;
    this.pop = Math.max(0, this.pop - effectDt);
    if (demo) {
      this.demoClock += this.reduced ? 0 : dt;
      if (this.demoClock >= .14) {
        this.demoClock %= .14; this.demoIndex = (this.demoIndex + 1) % this.demoRoute.length;
        this.previousDemo = this.demoPath.map(c => ({ ...c }));
        this.demoPath.unshift({ ...this.demoRoute[this.demoIndex] }); this.demoPath.pop();
      }
      this.drawSnake(this.demoPath, this.previousDemo, this.demoClock / .14, dt, false);
    } else if (!this.exploded) this.drawSnake(game.body, game.previous, game.alpha, frozen ? 0 : dt, ['dying', 'over'].includes(game.phase));
    const food = demo ? { x: 13, y: 12 } : game.food;
    const gold = demo ? { x: 6, y: 7, remaining: 6.5 } : game.bonus;
    this.food.visible = this.foodHalo.visible = !!food;
    this.gold.visible = this.goldHalo.visible = this.goldTimer.visible = !!gold;
    const animation = this.reduced ? 0 : this.time;
    if (food) {
      this.food.position.copy(world(food)); this.food.position.y = .64 + Math.sin(animation * 3) * .07;
      this.food.rotation.y = animation * .45; this.food.rotation.z = Math.sin(animation * 2) * .09;
      this.foodHalo.position.set(food.x - 9.5, .015, food.y - 9.5);
    }
    if (gold) {
      this.gold.position.copy(world(gold)); this.gold.position.y = .92 + Math.sin(animation * 3.5) * .1;
      this.gold.rotation.set(-.35, animation * 1.1, Math.sin(animation * 2) * .1);
      this.goldHalo.position.set(gold.x - 9.5, .015, gold.y - 9.5);
      this.goldTimer.position.set(gold.x - 9.5, .065, gold.y - 9.5);
      const segments = Math.ceil(Math.max(0, gold.remaining / BONUS_SECONDS) * 64);
      this.goldTimer.geometry.setDrawRange(0, segments * 5 * 6);
      this.goldTimer.material.opacity = gold.remaining < 2 ? .6 + Math.sin(animation * 12) * .4 : 1;
      this.goldTimer.material.transparent = true;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach((p, i) => {
      p.life -= effectDt; p.velocity.y -= effectDt * 6; p.position.addScaledVector(p.velocity, effectDt);
      if (p.position.y < .04) { p.position.y = .04; p.velocity.y *= -.35; }
      this.matrix.position.copy(p.position); this.matrix.rotation.set(0, 0, 0); this.matrix.scale.setScalar(p.size * Math.max(0, p.life / p.maxLife)); this.matrix.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.matrix.matrix); this.particleMesh.setColorAt(i, p.color);
    });
    this.particleMesh.count = this.particles.length; this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    // Result dialogs do not freeze the aftermath. Only an actual pause does.
    if (this.debris.length) this.debrisAge += effectDt;
    this.debrisMesh.material.opacity = THREE.MathUtils.clamp((DEBRIS_LIFETIME - this.debrisAge) / DEBRIS_FADE_SECONDS, 0, 1);
    let visibleDebris = 0;
    for (const piece of this.debris) {
      piece.life -= effectDt;
      if (piece.life <= 0 || this.reduced) continue;
      piece.velocity.y -= effectDt * 9;
      piece.position.addScaledVector(piece.velocity, effectDt);
      piece.rotation.addScaledVector(piece.spin, effectDt);
      // Fragments beyond the plinth fall away instead of bouncing on empty air.
      if (piece.position.y < .08 && Math.abs(piece.position.x) < 10.7 && Math.abs(piece.position.z) < 10.7) {
        piece.position.y = .08; piece.velocity.y = Math.abs(piece.velocity.y) * .3;
        piece.velocity.x *= .75; piece.velocity.z *= .75;
      }
      this.matrix.position.copy(piece.position);
      this.matrix.rotation.set(piece.rotation.x, piece.rotation.y, piece.rotation.z);
      const fade = Math.min(1, piece.life / DEBRIS_FADE_SECONDS);
      this.matrix.scale.copy(piece.size).multiplyScalar(fade * fade * (3 - 2 * fade));
      this.matrix.updateMatrix(); this.debrisMesh.setColorAt(visibleDebris, piece.color);
      this.debrisMesh.setMatrixAt(visibleDebris++, this.matrix.matrix);
    }
    this.debrisMesh.count = visibleDebris;
    if (visibleDebris) { this.debrisMesh.instanceMatrix.needsUpdate = true; this.debrisMesh.instanceColor!.needsUpdate = true; }
    else this.debris = [];
    for (const ring of this.rings) {
      ring.life -= effectDt; ring.mesh.visible = ring.life > 0;
      if (ring.life > 0) { const p = 1 - ring.life / ring.maxLife; ring.mesh.scale.setScalar(.35 + p * (this.reduced ? .65 : 1.9)); ring.mesh.material.opacity = (1 - p) * .7; }
    }
    this.light.intensity *= Math.exp(-effectDt * 9);
    this.cameraShake = Math.max(0, this.cameraShake - effectDt);
    const shake = this.cameraShake * (this.effects && !this.reduced ? .12 : 0);
    this.camera.position.x = Math.sin(this.time * 91) * shake;
    this.renderer.render(this.scene, this.camera);
  }
  get stats() { return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, particles: this.particles.length, debris: this.debrisMesh.count, pixelRatio: this.renderer.getPixelRatio() }; }
}
