import * as THREE from 'three';
import { loadCity } from './world/cityData';
import { buildCity } from './world/buildCity';
import { CollisionWorld } from './world/collision';
import { StreetIndex } from './world/streets';
import { Placement } from './world/placement';
import { ItemSystem } from './world/items/ItemSystem';
import { ReturnPoints } from './world/ReturnPoints';
import { BuildingSystem } from './world/buildings/BuildingSystem';
import { MohuGame } from './minigames/mohu/MohuGame';
import { Shops, doorOnFacade } from './world/shops/Shops';
import { buildMarketHall, mostNorthWestEdge } from './world/landmarks/marketHall';
import { buildDressing } from './world/landmarks/dressing';
import { Input } from './player/input';
import { Player } from './player/Player';
import { FollowCamera } from './player/FollowCamera';
import { Interaction } from './player/Interaction';
import { Minimap, type MapMarker } from './ui/Minimap';
import { Hud, funniestStat } from './ui/Hud';
import { GameState } from './state/GameState';
import { newSeed } from './state/rng';
import { formatFt } from './state/time';
import { BIKE, DOG, GLASS_BREAK } from './state/balance';
import { DayNight } from './world/DayNight';
import { facadeUniforms } from './world/facade';
import { Lamps } from './world/lamps';
import { DogMess } from './world/DogMess';
import { Bikes } from './world/Bikes';
import { RoadGraph } from './npc/RoadGraph';
import { Crowd } from './npc/Crowd';
import { Sweeper } from './npc/Sweeper';
import { say } from './audio/voice';
import { Creator } from './ui/Creator';
import { loadLook, saveLook, type CharacterLook } from './player/look';
import { LocalScoreStore, type ScoreStore } from './state/scores';
import { renderScores } from './ui/Scores';
import { sound } from './audio/Sfx';
import { loadSettings, saveSettings, type Settings } from './state/settings';

/** Debug keys (G fast walk, T fast time) and the fps line: dev builds or ?debug. */
const DEBUG = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

const canvas = document.getElementById('game') as HTMLCanvasElement;
const $ = (id: string) => document.getElementById(id)!;
const streetEl = $('street');
const debugEl = $('debug');
const startEl = $('start');
const endEl = $('end');
const playBtn = $('play') as HTMLButtonElement;
const titleEl = $('title');
const introEl = $('intro');
const scoresEl = $('scores');
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

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.2, 2400);

const hemi = new THREE.HemisphereLight(0xdcecff, 0x8a8172, 1.6);
scene.add(hemi);
// Sun (and moon at night); the shadow box follows the player.
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
const dayNight = new DayNight(scene, hemi, sun);
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
const hallBuilding = city.buildings.find((b) => b.name === 'Központi Vásárcsarnok');
const cityGroup = buildCity(city, { skip: new Set(hallBuilding ? [hallBuilding.id] : []) });
scene.add(cityGroup);
const hall = hallBuilding ? buildMarketHall(hallBuilding, mostNorthWestEdge(hallBuilding.outer)) : null;
if (hall) cityGroup.add(hall.group);
const world = CollisionWorld.fromCity(city);
const streets = new StreetIndex(city);
const placement = new Placement(city);

const dressing = buildDressing(city, placement);
cityGroup.add(dressing.group);
for (const c of dressing.colliders) world.addBox(c.x, c.z, c.w, c.d, c.rot);
const state = new GameState(newSeed());
const items = new ItemSystem(city, placement, state, { hidden: dressing.hiddenSpots, bagSpots: dressing.kioskSpots });
scene.add(items.group);
for (const c of hall?.colliders ?? []) world.addBox(c.x, c.z, c.w, c.d, c.rot);

const lamps = new Lamps(city, placement);
scene.add(lamps.group);
for (const [x, z] of lamps.posts) world.addBox(x, z, 0.3, 0.3);
const dogMess = new DogMess(placement, state);
scene.add(dogMess.group);
const bikes = new Bikes(placement, state);
scene.add(bikes.group);
const graph = new RoadGraph(city, placement);
const crowd = new Crowd(city, graph, placement, {
  drop: (x, z) => items.drop(x, z, state.rng.weighted({ pet: 0.4, can: 0.4, glass: 0.2 })),
  dogMess: (x, z) => dogMess.add(x, z),
  greet: () => say(Math.random() < 0.7 ? 'st_szia' : 'st_jo_fogas', 2.2),
});
scene.add(crowd.group);
const sweeper = new Sweeper(graph);
sweeper.onSweep = (x, z, r) => items.sweep(x, z, r);
scene.add(sweeper.group);

const [sx, sz] = city.landmarks.spawn ?? [0, 0];
const player = new Player(world, sx, sz);
scene.add(player.mesh);
const input = new Input(canvas);
const follow = new FollowCamera(camera, world);
const host = {
  player, follow, cityWorld: world,
  setOutsideVisible(v: boolean) {
    for (const g of [cityGroup, items.group, buildings.gates.group, lamps.group, dogMess.group, bikes.group, sweeper.group, shops.street]) g.visible = v;
  },
};
// No street gates on top of the shop doors.
const shopDoorSpots = [city.landmarks.spar ? doorOnFacade(city, city.landmarks.spar) : null, hall?.door ?? null]
  .filter((d) => d !== null).map((d) => [d!.x, d!.z] as [number, number]);
const buildings = new BuildingSystem(city, placement, state, host, streets, shopDoorSpots);
scene.add(buildings.group);
const shops = new Shops(city, state, host, hall?.door ?? null);
scene.add(shops.group, shops.street, shops.lights);
const returns = new ReturnPoints(state, shops.doors.map((d) => ({ id: d.id, name: d.name, ...d.interior.machines })));
scene.add(returns.group);
for (const p of returns.points) {
  const f = returns.footprint(p);
  shops.doors.find((d) => d.id === p.id)!.interior.world.addBox(f.x, f.z, f.w, f.d, f.rot);
}
const mohu = new MohuGame(scene, state);
returns.onUse = (p, m) => {
  mohu.start({ machine: p.machines[m], name: p.name, onEnd: () => returns.stop() });
};
const inside = () => buildings.inside || shops.inside;
buildings.enterBlock = () => player.onBike ? 'Get off the bike first (F)' : null;
shops.enterBlock = buildings.enterBlock;
const interaction = new Interaction();
interaction.add((x, z) => bikes.interactables(x, z));
interaction.add((x, z) => buildings.getInteractables(x, z));
interaction.add((x, z) => items.interactables(x, z));
interaction.add(() => returns.interactables());
interaction.add(() => shops.interactables());
const hud = new Hud(state);
player.allowDebug = DEBUG;
mohu.onSound = (n) => sound.play(n);
interaction.onRustle = () => sound.play('search');
{
  const kalvin = city.landmarks.kalvinTer;
  if (kalvin) follow.yaw = Math.atan2(sx - kalvin[0], sz - kalvin[1]);
}

// The two return points: SPAR at Kinizsi/Ráday and Aldi in the market hall.
const markers: MapMarker[] = [];
for (const d of shops.doors) {
  markers.push(d.id === 'spar' ? { p: [d.x, d.z], label: 'S', color: '#d4202c' } : { p: [d.x, d.z], label: 'A', color: '#1f5fa8' });
}
const minimap = new Minimap($('minimap') as HTMLCanvasElement, city, markers);

if (import.meta.env.DEV) Object.assign(window, { game: { renderer, scene, camera, player, follow, city, world, minimap, state, items, returns, placement, interaction, buildings, shops, hall, mohu, crowd, bikes, dogMess, sweeper, lamps, dayNight, graph } });

function mount(b: import('./world/Bikes').Bike) {
  sound.play('bell');
  b.lying = false;
  b.ridden = true;
  bikes.current = b;
  player.onBike = true;
  player.teleport(b.x, b.z, b.heading);
  state.toast('On the bike: F to get off', 'info');
}
function dismount(crashed: boolean) {
  const b = bikes.current;
  if (!b) return;
  player.onBike = false;
  bikes.drop(b, player.position.x, player.position.z, player.facing, crashed);
}
bikes.onToggle = (b) => mount(b);

const creator = new Creator(renderer);
const scoreStore: ScoreStore = new LocalScoreStore();
let look: CharacterLook = loadLook();
let portrait = '';
player.setLook(look.colors, look.opts);
type Screen = 'title' | 'creator' | 'intro' | 'run' | 'end' | 'scores';
let screen: Screen = 'title';

function show(next: Screen) {
  screen = next;
  titleEl.classList.toggle('hidden', next !== 'title');
  introEl.classList.toggle('hidden', next !== 'intro');
  endEl.classList.toggle('hidden', next !== 'end');
  scoresEl.classList.toggle('hidden', next !== 'scores');
  startEl.classList.add('hidden');
  document.body.classList.toggle('in-menu', next !== 'run');
}

function openCreator() {
  show('creator');
  creator.open(look, (l, p) => {
    look = l;
    portrait = p;
    saveLook(l);
    player.setLook(l.colors, l.opts);
    show('intro');
  });
}

function startRun() {
  state.reset(newSeed());
  if (mohu.active) mohu.finish();
  returns.reset();
  items.reset();
  if (shops.inside) shops.leave(false);
  if (buildings.reset().bigBagInCourtyard) items.hideBigBag();
  returns.stop();
  crowd.reset();
  dogMess.reset();
  bikes.reset();
  sweeper.reset();
  player.onBike = false;
  player.stun = 0;
  player.teleport(sx, sz, 0);
  player.stamina = 100;
  // Start looking up Lónyay utca toward Kálvin tér.
  const kalvin = city.landmarks.kalvinTer;
  if (kalvin) follow.yaw = Math.atan2(sx - kalvin[0], sz - kalvin[1]);
  follow.pitch = 0.3;
  show('run');
}

async function endRun() {
  if (mohu.active) mohu.finish();
  returns.stop();
  if (buildings.inside) buildings.leave(false);
  if (shops.inside) shops.leave(false);
  document.exitPointerLock();
  const s = state.stats;
  $('end-money').textContent = formatFt(state.money);
  ($('end-portrait') as HTMLImageElement).src = portrait;
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
  $('end-rank').textContent = '';
  show('end');
  let highlight: string | undefined;
  if (state.money > 0) {
    const { rank, entry } = await scoreStore.add({ name: look.name, amountFt: state.money, items: s.itemsReturned, portrait });
    highlight = entry.id;
    $('end-rank').textContent = rank ? `You made the wall of fame: #${rank}!` : 'Not in the top 10 this time.';
  }
  await renderScores($('end-scores'), scoreStore, highlight);
}

streetEl.textContent = 'Lónyay utca';
const titlePlay = $('t-play') as HTMLButtonElement;
titlePlay.disabled = false;
titlePlay.textContent = 'Play';
titlePlay.onclick = () => openCreator();
$('t-scores').onclick = async () => { await renderScores($('scores-table'), scoreStore); show('scores'); };
$('s-back').onclick = () => show('title');
$('i-go').onclick = () => { startRun(); input.lock(); };
playBtn.onclick = () => input.lock();
$('p-quit').onclick = () => {
  if (mohu.active) mohu.finish();
  if (buildings.inside) buildings.leave(false);
  if (shops.inside) shops.leave(false);
  state.status = 'ready';
  show('title');
};
$('again').onclick = () => openCreator();
$('e-title').onclick = () => show('title');
canvas.onclick = () => { if (!input.locked && screen === 'run' && state.status === 'playing') input.lock(); };
document.addEventListener('pointerlockchange', () => {
  startEl.classList.toggle('hidden', input.locked || screen !== 'run' || state.status !== 'playing');
});
show('title');

// ---------------------------------------------------------------- settings
const settings: Settings = loadSettings();
function applySettings() {
  sound.volumes = { master: settings.master, sfx: settings.sfx, voice: settings.voice };
  sound.voiceMode = settings.voiceMode;
  sound.applyVolumes();
  follow.sensitivity = settings.mouse;
  const q = settings.quality;
  renderer.setPixelRatio(q === 'low' ? 1 : Math.min(devicePixelRatio, q === 'medium' ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  sun.castShadow = q !== 'low';
  const size = q === 'high' ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  crowd.maxNpcs = q === 'low' ? 30 : q === 'medium' ? 45 : 60;
}
applySettings();
let settingsReturn: Screen | 'pause' = 'title';
const stEl = $('settings');
function openSettings(from: Screen | 'pause') {
  settingsReturn = from;
  for (const [id, key] of [['st-master', 'master'], ['st-sfx', 'sfx'], ['st-voice', 'voice'], ['st-mouse', 'mouse']] as const) {
    const el = $(id) as HTMLInputElement;
    el.value = String(settings[key]);
    el.oninput = () => { settings[key] = Number(el.value); applySettings(); saveSettings(settings); };
  }
  for (const [id, key] of [['st-voicemode', 'voiceMode'], ['st-quality', 'quality']] as const) {
    const el = $(id) as HTMLSelectElement;
    el.value = settings[key];
    el.onchange = () => { (settings as unknown as Record<string, string>)[key] = el.value; applySettings(); saveSettings(settings); };
  }
  $('st-voicenote').textContent = 'Voice lines use generated Hungarian recordings when present, otherwise your browser\'s Hungarian voice if it has one. Subtitles always show.';
  titleEl.classList.add('hidden');
  startEl.classList.add('hidden');
  stEl.classList.remove('hidden');
}
$('st-back').onclick = () => {
  stEl.classList.add('hidden');
  if (settingsReturn === 'pause') startEl.classList.remove('hidden');
  else show(settingsReturn);
};
$('t-settings').classList.remove('hidden');
$('t-settings').onclick = () => openSettings('title');
$('p-settings').onclick = () => openSettings('pause');
// Audio starts on the first click (browsers require a gesture); every button clicks.
addEventListener('pointerdown', () => sound.init());
addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName === 'BUTTON') sound.play('click'); });

const clock = new THREE.Clock();
let fpsTime = 0, fpsFrames = 0, fps = 0;

let titleAngle = 0;
let stepAcc = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (creator.active) {
    creator.render(dt);
    input.endFrame();
    return;
  }
  const playing = state.status === 'playing' && input.locked;
  const lighting = dayNight.update(state.minute);
  lamps.update(dt, lighting.lamps, player.position.x, player.position.z);
  facadeUniforms.uNight.value = lighting.lamps;
  sound.ambience(lighting.night, !inside() && screen === 'run', dt);

  if (playing) {
    if (DEBUG && input.wasPressed('KeyT')) {
      state.timeScale = state.timeScale === 1 ? 30 : 1;
      state.toast(state.timeScale > 1 ? 'Debug: time ×30' : 'Debug: time normal');
    }
    const before = state.minute;
    if (state.tick(dt)) void endRun();
    const gameMinutes = state.minute - before;

    const px = player.position.x, pz = player.position.z;
    // F gets off the bike anywhere.
    if (bikes.current && input.wasPressed('KeyF') && !mohu.active) dismount(false);
    player.speedMul = dogMess.slowed > 0 ? DOG.slowFactor : 1;
    if (!mohu.active) player.update(dt, input, follow.yaw);
    else mohu.update(dt, input);
    if (!inside()) {
      // Pedestrians and the sweeper are solid; a fast bike into a person is a crash.
      const fast = player.onBike && player.speed > BIKE.crashSpeed;
      if (fast && crowd.hit(player.position.x, player.position.z, 0.35)) player.crashed = true;
      let [nx, nz] = crowd.pushOut(player.position.x, player.position.z, 0.35);
      [nx, nz] = sweeper.pushOut(nx, nz, 0.35);
      [nx, nz] = world.resolve(nx, nz, 0.35);
      player.position.x = nx; player.position.z = nz;
      player.mesh.position.copy(player.position);
    }
    if (player.crashed && bikes.current) {
      dismount(true);
      player.fall(BIKE.stun);
      state.stats.bikeCrashes++;
      state.toast('Crash! You fell off the bike.', 'bad');
      sound.play('clunk');
    }
    bikes.follow(player.position.x, player.position.z, player.facing, 0);
    const moved = Math.hypot(player.position.x - px, player.position.z - pz);
    // Footsteps.
    if (!player.onBike && player.grounded && moved < 1) {
      stepAcc += moved;
      if (stepAcc > (player.running ? 1.1 : 0.75)) { stepAcc = 0; sound.play('step', dogMess.slowed > 0 ? 2 : 1); }
    }
    state.stats.distance += moved;
    if (!inside() && dogMess.update(dt, player.position.x, player.position.z, player.facing, player.grounded, player.onBike, moved)) {
      state.toast('Eww! Dog mess. Slowed down for a minute.', 'bad');
      sound.play('squelch');
    }

    // Running with a nearly full bag can break a glass bottle.
    if (player.running && player.speed > 3 && state.bag.length >= state.capacity * GLASS_BREAK.minFill &&
        state.rng.chance(GLASS_BREAK.perSecond * dt) && state.breakGlass()) {
      state.toast('Clink! A glass bottle broke.', 'bad');
      sound.play('glass');
    }

    buildings.searching = interaction.progress > 0;
    buildings.update(dt);
    if (shops.update()) state.toast('Midnight: the shop is closing. Out you go!', 'bad');
    items.update(dt, gameMinutes, player.position.x, player.position.z, lighting.night);
    crowd.update(dt, state.minute, player.position.x, player.position.z, !inside());
    sweeper.update(dt, state.minute, player.position.x, player.position.z);
    returns.update(dt, player.position.x, player.position.z);
    interaction.holdDisabledReason = player.onBike ? 'Get off the bike first (F)' : null;
    if (!mohu.active) interaction.update(dt, input, player.position.x, player.position.z, player.facing);
    else interaction.prompt = null;
    if (input.wasPressed('KeyM')) minimap.toggleLarge();
  }
  player.mesh.visible = !mohu.active;
  document.body.classList.toggle('mohu-on', mohu.active);
  if (mohu.active) mohu.camera(camera);
  else if (screen === 'title' || screen === 'scores') {
    // Slow orbit over the neighbourhood behind the menus.
    titleAngle += dt * 0.04;
    camera.position.set(sx + Math.sin(titleAngle) * 260, 150, sz + Math.cos(titleAngle) * 260);
    camera.lookAt(sx, 0, sz);
  } else follow.update(dt, input, player.position);
  const [mx, mz] = shops.mapPos() ?? buildings.mapPos(player.position.x, player.position.z);
  minimap.draw(mx, mz, player.facing);
  staminaFill.style.width = `${player.stamina}%`;
  staminaEl.classList.toggle('exhausted', player.exhausted);

  const status: string[] = [];
  if (player.debugFast) status.push('Debug walk');
  if (state.timeScale > 1) status.push(`Time ×${state.timeScale}`);
  if (state.bigBag) status.push('Big blue bag');
  if (player.onBike) status.push('On a bike');
  if (dogMess.slowed > 0) status.push(`Slowed: dog mess ${Math.ceil(dogMess.slowed)} s`);
  if (buildings.inside) status.push('In a courtyard');
  hud.update(state, interaction, status);

  sun.position.copy(player.position).add(dayNight.offset);
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
    streetEl.textContent = (shops.current ? shops.current.name : null) ?? buildings.streetName() ?? streets.nearest(p.x, p.z) ?? 'Belső-Ferencváros';
    debugEl.textContent = DEBUG
      ? `${fps} fps · ${player.speed.toFixed(1)} m/s · x ${p.x.toFixed(0)} z ${p.z.toFixed(0)} · spawned ${state.spawned}` : '';
  }
}
// Compile every shader once up front (interiors and close-up items included) so that
// entering a shop or feeding the first bottle does not stall on a shader compile.
{
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  const extra = mohu.prewarmMeshes();
  scene.add(...extra);
  renderer.compile(scene, camera);
  scene.remove(...extra);
  for (const o of hidden) o.visible = false;
}
renderer.setAnimationLoop(frame);
