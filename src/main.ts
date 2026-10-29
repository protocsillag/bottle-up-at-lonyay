import * as THREE from 'three';
import { loadCity } from './world/cityData';
import { buildCity } from './world/buildCity';
import { CollisionWorld } from './world/collision';
import { StreetIndex } from './world/streets';
import { Input } from './player/input';
import { Player } from './player/Player';
import { FollowCamera } from './player/FollowCamera';
import { Minimap, type MapMarker } from './ui/Minimap';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const streetEl = document.getElementById('street')!;
const debugEl = document.getElementById('debug')!;
const startEl = document.getElementById('start')!;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const staminaEl = document.getElementById('stamina')!;
const staminaFill = document.getElementById('stamina-fill')!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const sky = new THREE.Color(0x9fc3e0);
scene.background = sky;
scene.fog = new THREE.Fog(sky, 250, 1300);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.2, 3000);

scene.add(new THREE.HemisphereLight(0xdcecff, 0x8a8172, 1.6));
// Morning sun from the south-east; the shadow box follows the player.
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
const SUN_OFFSET = new THREE.Vector3(120, 160, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 500 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const city = await loadCity();
scene.add(buildCity(city));
const world = new CollisionWorld(city);
const streets = new StreetIndex(city);

const [sx, sz] = city.landmarks.spawn ?? [0, 0];
const player = new Player(world, sx, sz);
scene.add(player.mesh);
const input = new Input(canvas);
const follow = new FollowCamera(camera, world);
// Start looking up Lónyay utca toward Kálvin tér.
const kalvin = city.landmarks.kalvinTer;
if (kalvin) follow.yaw = Math.atan2(sx - kalvin[0], sz - kalvin[1]);
// The two return points: SPAR at Kinizsi/Ráday and Aldi in the market hall.
const markers: MapMarker[] = [];
if (city.landmarks.spar) markers.push({ p: city.landmarks.spar, label: 'S', color: '#d4202c' });
if (city.landmarks.marketHall) markers.push({ p: city.landmarks.marketHall, label: 'A', color: '#1f5fa8' });
const minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, city, markers);

if (import.meta.env.DEV) Object.assign(window, { game: { renderer, scene, camera, player, follow, city, world, minimap } });

streetEl.textContent = 'Lónyay utca';
playBtn.disabled = false;
playBtn.textContent = 'Walk';
playBtn.onclick = () => input.lock();
canvas.onclick = () => { if (!input.locked) input.lock(); };
document.addEventListener('pointerlockchange', () => startEl.classList.toggle('hidden', input.locked));

const clock = new THREE.Clock();
let fpsTime = 0, fpsFrames = 0, fps = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);

  player.update(dt, input, follow.yaw);
  follow.update(dt, input, player.position);
  if (input.wasPressed('KeyM')) minimap.toggleLarge();
  minimap.draw(player.position.x, player.position.z, player.facing);
  staminaFill.style.width = `${player.stamina}%`;
  staminaEl.classList.toggle('exhausted', player.exhausted);

  sun.position.copy(player.position).add(SUN_OFFSET);
  sun.target.position.copy(player.position);

  renderer.render(scene, camera);
  input.endFrame();

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
    const p = player.position;
    streetEl.textContent = streets.nearest(p.x, p.z) ?? 'Belső-Ferencváros';
    debugEl.textContent =
      `${fps} fps · ${player.speed.toFixed(1)} m/s${player.debugFast ? ' (fast)' : ''}\n` +
      `x ${p.x.toFixed(0)}  z ${p.z.toFixed(0)}`;
  }
});
