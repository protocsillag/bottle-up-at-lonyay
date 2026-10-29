import * as THREE from 'three';
import { loadCity } from './world/cityData';
import { buildCity } from './world/buildCity';
import { CollisionWorld } from './world/collision';
import { StreetIndex } from './world/streets';
import { Placement } from './world/placement';
import { ItemSystem } from './world/items/ItemSystem';
import { ReturnPoints } from './world/ReturnPoints';
import { BuildingSystem } from './world/buildings/BuildingSystem';
import { Input } from './player/input';
import { Player } from './player/Player';
import { FollowCamera } from './player/FollowCamera';
import { Interaction } from './player/Interaction';
import { Minimap, type MapMarker } from './ui/Minimap';
import { Hud, funniestStat } from './ui/Hud';
import { GameState } from './state/GameState';
import { newSeed } from './state/rng';
import { formatFt } from './state/time';
import { GLASS_BREAK } from './state/balance';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const $ = (id: string) => document.getElementById(id)!;
const streetEl = $('street');
const debugEl = $('debug');
const startEl = $('start');
const endEl = $('end');
const playBtn = $('play') as HTMLButtonElement;
const staminaEl = $('stamina');
const staminaFill = $('stamina-fill');

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
const cityGroup = buildCity(city);
scene.add(cityGroup);
const world = CollisionWorld.fromCity(city);
const streets = new StreetIndex(city);
const placement = new Placement(city);

const state = new GameState(newSeed());
const items = new ItemSystem(city, placement, state);
scene.add(items.group);
const returns = new ReturnPoints(city, placement, state);
scene.add(returns.group);
for (const p of returns.points) world.addBox(p.x, p.z, 1.8, 0.7, p.facing);

const [sx, sz] = city.landmarks.spawn ?? [0, 0];
const player = new Player(world, sx, sz);
scene.add(player.mesh);
const input = new Input(canvas);
const follow = new FollowCamera(camera, world);
const buildings = new BuildingSystem(city, placement, state, {
  player, follow, cityWorld: world,
  setOutsideVisible(v) {
    for (const g of [cityGroup, items.group, returns.group, buildings.gates.group]) g.visible = v;
  },
}, streets);
scene.add(buildings.group);
const interaction = new Interaction();
interaction.add((x, z) => buildings.getInteractables(x, z));
interaction.add((x, z) => items.interactables(x, z));
interaction.add(() => returns.interactables());
const hud = new Hud(state);
{
  const kalvin = city.landmarks.kalvinTer;
  if (kalvin) follow.yaw = Math.atan2(sx - kalvin[0], sz - kalvin[1]);
}

// The two return points: SPAR at Kinizsi/Ráday and Aldi in the market hall.
const markers: MapMarker[] = [];
for (const p of returns.points) {
  markers.push(p.id === 'spar' ? { p: [p.x, p.z], label: 'S', color: '#d4202c' } : { p: [p.x, p.z], label: 'A', color: '#1f5fa8' });
}
const minimap = new Minimap($('minimap') as HTMLCanvasElement, city, markers);

if (import.meta.env.DEV) Object.assign(window, { game: { renderer, scene, camera, player, follow, city, world, minimap, state, items, returns, placement, interaction, buildings } });

function startRun() {
  state.reset(newSeed());
  items.reset();
  if (buildings.reset().bigBagInCourtyard) items.hideBigBag();
  returns.stop();
  player.teleport(sx, sz, 0);
  player.stamina = 100;
  // Start looking up Lónyay utca toward Kálvin tér.
  const kalvin = city.landmarks.kalvinTer;
  if (kalvin) follow.yaw = Math.atan2(sx - kalvin[0], sz - kalvin[1]);
  endEl.classList.add('hidden');
  $('start').querySelector('h1')!.textContent = 'Paused';
  playBtn.textContent = 'Resume';
}

function endRun() {
  returns.stop();
  document.exitPointerLock();
  const s = state.stats;
  $('end-money').textContent = formatFt(state.money);
  const rows: [string, string | number][] = [
    ['Items returned', s.itemsReturned],
    ['Items still in the bag (worth nothing)', state.bag.length],
    ['Items collected', s.itemsCollected],
    ['Bins searched', s.binsSearched],
    ['Distance walked', `${(s.distance / 1000).toFixed(1)} km`],
  ];
  $('end-stats').replaceChildren(...rows.map(([k, v]) => {
    const tr = document.createElement('tr');
    tr.append(Object.assign(document.createElement('td'), { textContent: k }), Object.assign(document.createElement('td'), { textContent: String(v) }));
    return tr;
  }));
  $('end-fun').textContent = funniestStat(s);
  endEl.classList.remove('hidden');
}

streetEl.textContent = 'Lónyay utca';
playBtn.disabled = false;
playBtn.textContent = 'Play';
playBtn.onclick = () => {
  if (state.status !== 'playing') startRun();
  input.lock();
};
$('again').onclick = () => { startRun(); input.lock(); };
canvas.onclick = () => { if (!input.locked && state.status === 'playing') input.lock(); };
document.addEventListener('pointerlockchange', () => {
  startEl.classList.toggle('hidden', input.locked || state.status === 'ended');
});

const clock = new THREE.Clock();
let fpsTime = 0, fpsFrames = 0, fps = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const playing = state.status === 'playing' && input.locked;

  if (playing) {
    if (input.wasPressed('KeyT')) {
      state.timeScale = state.timeScale === 1 ? 30 : 1;
      state.toast(state.timeScale > 1 ? 'Debug: time ×30' : 'Debug: time normal');
    }
    const before = state.minute;
    if (state.tick(dt)) endRun();
    const gameMinutes = state.minute - before;

    const px = player.position.x, pz = player.position.z;
    player.update(dt, input, follow.yaw);
    state.stats.distance += Math.hypot(player.position.x - px, player.position.z - pz);

    // Running with a nearly full bag can break a glass bottle.
    if (player.running && player.speed > 3 && state.bag.length >= state.capacity * GLASS_BREAK.minFill &&
        state.rng.chance(GLASS_BREAK.perSecond * dt) && state.breakGlass()) {
      state.toast('Clink! A glass bottle broke.', 'bad');
    }

    buildings.searching = interaction.progress > 0;
    buildings.update(dt);
    items.update(dt, gameMinutes, player.position.x, player.position.z);
    returns.update(dt, player.position.x, player.position.z);
    interaction.update(dt, input, player.position.x, player.position.z, player.facing);
    if (input.wasPressed('KeyM')) minimap.toggleLarge();
  }
  follow.update(dt, input, player.position);
  const [mx, mz] = buildings.mapPos(player.position.x, player.position.z);
  minimap.draw(mx, mz, player.facing);
  staminaFill.style.width = `${player.stamina}%`;
  staminaEl.classList.toggle('exhausted', player.exhausted);

  const status: string[] = [];
  if (returns.isFeeding) status.push('Feeding the machine');
  if (player.debugFast) status.push('Debug walk');
  if (state.timeScale > 1) status.push(`Time ×${state.timeScale}`);
  if (state.bigBag) status.push('Big blue bag');
  if (buildings.inside) status.push('In a courtyard');
  hud.update(state, interaction, status);

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
    streetEl.textContent = buildings.streetName() ?? streets.nearest(p.x, p.z) ?? 'Belső-Ferencváros';
    debugEl.textContent = import.meta.env.DEV || player.debugFast
      ? `${fps} fps · ${player.speed.toFixed(1)} m/s · x ${p.x.toFixed(0)} z ${p.z.toFixed(0)}` : '';
  }
}
renderer.setAnimationLoop(frame);
