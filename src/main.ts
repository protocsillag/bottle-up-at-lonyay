import * as THREE from 'three';
import { loadCity, type Building } from './world/cityData';
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
import { buildGimnaziumExtras, findGimnazium, lonyayColors } from './world/landmarks/lonyay';
import { buildMosoda, buildWear, matyasColors, RoadWorks } from './world/landmarks/matyas';
import { buildLot, buildRaday, prepareRaday } from './world/landmarks/raday';
import { excludeGateAreas } from './world/buildings/gates';
import { buildErkel, prepareErkel } from './world/landmarks/erkel';
import { buildParking } from './world/landmarks/parking';
import { buildStreetSigns } from './world/landmarks/streetSigns';
import { Input } from './player/input';
import { Player } from './player/Player';
import { FollowCamera } from './player/FollowCamera';
import { Interaction } from './player/Interaction';
import { Minimap, type MapMarker } from './ui/Minimap';
import { Hud, funniestStat } from './ui/Hud';
import { GameState } from './state/GameState';
import { newSeed } from './state/rng';
import { GAME_MIN_PER_SEC, formatFt } from './state/time';
import { BIKE, DOG, EXTRA_BAGS, GLASS_BREAK, HUNGER, TILL, TIPSY, TRAFFIC } from './state/balance';
import { Traffic } from './npc/Traffic';
import { Puddles } from './world/Puddles';
import type { ShopDoor } from './world/shops/Shops';
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
// Ráday utca from Alex's photos: car-free north stretch, the empty lot, the Art Nouveau house.
const radayPrep = prepareRaday(city);
if (radayPrep.lot) excludeGateAreas([radayPrep.lot.b.outer]);
// Lónyay utca from Alex's photos: the brick school and the street's palette.
const gimnazium = findGimnazium(city);
const cityColors = matyasColors(city, lonyayColors(city, gimnazium));
if (radayPrep.art) cityColors.set(radayPrep.art.b.id, 0xf3f0e8);
// Erkel and Török Pál utca: the grey palace, the old low graffiti house, the ochre block.
const erkelPrep = prepareErkel(city, cityColors, new Set([gimnazium?.b, radayPrep.art?.b].filter((b) => !!b) as Building[]));
const cityGroup = buildCity(city, {
  skip: new Set([hallBuilding?.id, erkelPrep.house?.b.id].filter((id): id is string => !!id)),
  palace: new Set(erkelPrep.palace ? [erkelPrep.palace.b.id] : []),
  colors: cityColors,
  noKerb: new Set(['Ráday utca']),
  brick: new Set(gimnazium ? [gimnazium.b.id] : []),
});
if (gimnazium) cityGroup.add(buildGimnaziumExtras(gimnazium));
cityGroup.add(buildStreetSigns(city));
const mosoda = buildMosoda(city);
if (mosoda) cityGroup.add(mosoda);
scene.add(cityGroup);
const hall = hallBuilding ? buildMarketHall(hallBuilding, mostNorthWestEdge(hallBuilding.outer)) : null;
if (hall) cityGroup.add(hall.group);
const world = CollisionWorld.fromCity(city);
const streets = new StreetIndex(city);
const placement = new Placement(city);

const dressing = buildDressing(city, placement);
cityGroup.add(dressing.group);
if (radayPrep.lot) {
  const lot = buildLot(radayPrep.lot, placement);
  cityGroup.add(lot.group);
  for (const c of lot.colliders) world.addBox(c.x, c.z, c.w, c.d, c.rot);
  for (const l of lot.lines) world.addLine(l);
  dressing.hiddenSpots.push(lot.spot);
}
for (const c of dressing.colliders) world.addBox(c.x, c.z, c.w, c.d, c.rot);
const parking = buildParking(city, placement);
cityGroup.add(parking.mesh);
for (const p of parking.cars) world.addBox(p.x, p.z, 1.8, 4.3, p.rot);
const state = new GameState(newSeed());
const items = new ItemSystem(city, placement, state, {
  hidden: dressing.hiddenSpots,
  bagSpots: [...dressing.kioskSpots, ...dressing.hiddenSpots.map((s) => [s.x, s.z] as [number, number])],
  skips: dressing.skips,
});
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
// The garbage truck takes in the wheelie bins put out on the pavement, 08:00–10:00.
const garbage: Sweeper = new Sweeper(graph, { from: 8, to: 10, hopper: 0xd8742a, brushes: false, target: (): [number, number] | null => items.wheelieTarget(garbage.x, garbage.z) });
garbage.onSweep = (x, z) => items.collectWheelies(x, z, 9);
scene.add(garbage.group);

const traffic = new Traffic(city);
scene.add(traffic.group);
const puddles = new Puddles();
scene.add(puddles.group);

const [sx, sz] = city.landmarks.spawn ?? [0, 0];
const player = new Player(world, sx, sz);
scene.add(player.mesh);
const input = new Input(canvas);
const follow = new FollowCamera(camera, world);
const host = {
  player, follow, cityWorld: world,
  setOutsideVisible(v: boolean) {
    for (const g of [cityGroup, items.group, buildings.gates.group, lamps.group, dogMess.group, bikes.group, sweeper.group, garbage.group, shops.street]) g.visible = v;
  },
};
// No street gates on top of the shop doors.
const [sx0, sz0] = city.landmarks.spawn ?? [0, 0];
// The SPAR corner on Lónyay utca (reference/lonyay-utca/spar-corner.jpg): decorative only;
// the return point stays the City Spar on Kinizsi utca.
const lonyaySpar = city.shops.find((s) => /spar/i.test(s.name ?? '') && Math.hypot(s.p[0] - sx0, s.p[1] - sz0) < 120 && s.p !== city.landmarks.spar);
const lonyaySparDoor = lonyaySpar ? doorOnFacade(city, lonyaySpar.p) : null;
const shopDoorSpots = [city.landmarks.spar ? doorOnFacade(city, city.landmarks.spar) : null, hall?.door ?? null, lonyaySparDoor]
  .filter((d) => d !== null).map((d) => [d!.x, d!.z] as [number, number]);
const buildings = new BuildingSystem(city, placement, state, host, streets, shopDoorSpots);
scene.add(buildings.group);
const shops = new Shops(city, state, host, hall?.door ?? null);
scene.add(shops.group, shops.street, shops.lights);
if (lonyaySparDoor) shops.addDecorativeFront(lonyaySparDoor);
// Mátyás utca wear and tear (reference/matyas-utca/): plinths, graffiti, road works.
const openings = [
  ...buildings.gates.gates.map((g) => ({ x: g.x, z: g.z, r: 1.9 })),
  ...shopDoorSpots.map(([x, z]) => ({ x, z, r: 3.5 })),
];
cityGroup.add(buildWear(city, placement, streets, {
  openings,
  noPlinth: new Set([gimnazium?.b.id, hallBuilding?.id, lonyaySpar ? placement.buildings.at(...lonyaySpar.p)?.id : undefined].filter((v): v is string => !!v)),
}));
const erkel = buildErkel(city, placement, erkelPrep);
cityGroup.add(erkel.group);
for (const c of erkel.colliders) world.addBox(c.x, c.z, c.w, c.d, c.rot);
const raday = buildRaday(city, placement, radayPrep, { openings: [...openings, ...dressing.skips.map((k) => ({ x: k.x, z: k.z, r: 3 }))] });
cityGroup.add(raday.group);
for (const c of raday.colliders) world.addBox(c.x, c.z, c.w, c.d, c.rot);
const roadWorks = new RoadWorks(placement, world, (x, z) => openings.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 4));
cityGroup.add(roadWorks.group);
for (const f of shops.fronts) for (const c of f.colliders) world.addBox(c.x, c.z, c.w, c.d, c.rot);
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
interaction.add((x, z) => items.interactables(x, z), true);
interaction.add(() => returns.interactables());
interaction.add(() => shops.interactables());
const hud = new Hud(state);
hud.onTick = () => sound.play('tick');
const hungerEl = $('hunger');
const hungerFill = $('hunger-fill');
const tillEl = $('till');
const tipsyFx = $('tipsy-fx');
let tillOpen: ShopDoor | null = null;
let hungerWarned = false;
let peeTimer = 0;
let lowFx = false;

traffic.onHonk = (d) => sound.play('honk', Math.max(0.2, 1 - d / 30));
traffic.onHit = () => {
  if (player.stun > 0) return;
  if (bikes.current) dismount(true);
  player.fall(TRAFFIC.knockdown);
  const lost = Math.min(state.bag.length, state.rng.int(TRAFFIC.lostItems[0], TRAFFIC.lostItems[1]));
  state.loseItems(lost);
  state.stats.carHits++;
  state.stats.itemsLostToCars += lost;
  sound.play('thud');
  if (lost > 0) setTimeout(() => sound.play('glass', 0.7), 150);
  say(state.rng.chance(0.6) ? 'car_vak' : 'car_figyelj', 2.4);
  state.toast(lost > 0 ? `Hit by a car! ${lost} ${lost === 1 ? 'item' : 'items'} smashed.` : 'Hit by a car!', 'bad');
};
shops.onTill = (d) => { tillOpen = d; tillEl.classList.remove('hidden'); };
function closeTill() { tillOpen = null; tillEl.classList.add('hidden'); }
function buy(what: 'food' | 'beer') {
  const price = TILL[what];
  if (!state.spend(price)) { say('till_nomoney'); sound.play('reject'); return; }
  sound.play('till');
  if (what === 'food') {
    state.eat();
    hungerWarned = false;
    say('till_food', 2.2);
    setTimeout(() => sound.play('munch'), 400);
    state.toast(`Bread roll with párizsi: −${price} Ft. Full again.`, 'good');
  } else {
    state.drinkBeer();
    say('till_beer', 2.2);
    setTimeout(() => sound.play('gulp'), 400);
    const h = Math.round((state.tipsyUntil - state.minute) / 60);
    state.toast(`Beer: −${price} Ft. Tipsy for ${h} h${state.tipsyLevel > 1 ? ` (level ${state.tipsyLevel})` : ''}.`, 'good');
  }
}
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

if (import.meta.env.DEV) Object.assign(window, { game: { renderer, scene, camera, player, follow, city, world, minimap, state, items, returns, placement, interaction, buildings, shops, hall, mohu, traffic, gimnazium, roadWorks, mosoda, raday, radayPrep, erkelPrep, puddles, crowd, bikes, dogMess, sweeper, lamps, dayNight, graph } });

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
  // About 4 extra bags per run, a third of them on the street.
  const extraBags = state.rng.int(EXTRA_BAGS.count[0], EXTRA_BAGS.count[1]);
  const streetBags = Math.max(1, Math.round(extraBags * EXTRA_BAGS.streetShare));
  items.placeBags(streetBags);
  buildings.reset(extraBags - streetBags);
  returns.stop();
  crowd.reset();
  dogMess.reset();
  bikes.reset();
  sweeper.reset();
  garbage.reset();
  player.onBike = false;
  player.stun = 0;
  player.freeze = 0;
  traffic.reset();
  puddles.reset();
  roadWorks.reset(state.rng);
  closeTill();
  hungerWarned = false;
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
    ['Spent on food and beer', formatFt(s.spentFt)],
    ['Walls watered', s.wallsWatered],
    ['Bins kicked over', s.binsKicked],
    ['Hit by cars', s.carHits],
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
  lowFx = q === 'low';
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
let wasStarving = false;

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
  raday.update((state.minute / 60) % 24, lighting.lamps);
  facadeUniforms.uNight.value = lighting.lamps;
  shops.updateFronts(lighting.lamps);
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
    // Hunger and beer change how you move.
    player.speedMul = (dogMess.slowed > 0 ? DOG.slowFactor : 1) * (state.starving ? HUNGER.speed : 1) * (state.tipsy ? TIPSY.speed : 1);
    player.canRun = !state.starving;
    if (!hungerWarned && state.hunger < HUNGER.warnAt && !state.starving) { hungerWarned = true; state.toast('Getting hungry — buy food at SPAR or Aldi', 'bad'); }
    if (state.starving && !wasStarving) state.toast("Too hungry! Slow, and you can't collect until you eat.", 'bad');
    wasStarving = state.starving;
    const wobble = state.tipsy ? state.tipsyLevel * (lowFx ? 0.5 : 1) : 0;
    const drift = wobble ? Math.sin(state.realTime * 0.9) * 0.08 * wobble : 0;
    if (tillOpen) {
      if (input.wasPressed('Digit1') || input.wasPressed('Numpad1')) buy('food');
      if (input.wasPressed('Digit2') || input.wasPressed('Numpad2')) buy('beer');
      if (input.wasPressed('KeyE') || Math.hypot(player.position.x - tillOpen.interior.till.x, player.position.z - tillOpen.interior.till.z) > 2.6) closeTill();
    }
    // Tipsy: P pees on the wall in front of you.
    if (state.tipsy && input.wasPressed('KeyP') && !player.onBike && player.freeze <= 0 && !mohu.active && !shops.inside) {
      const fx = -Math.sin(player.facing), fz = -Math.cos(player.facing);
      const hit = player.world.raycast(player.position.x, player.position.z, player.position.x + fx * 1.6, player.position.z + fz * 1.6);
      if (hit < 1) {
        player.freeze = TIPSY.peeSeconds;
        peeTimer = TIPSY.peeSeconds;
        sound.play('stream');
      } else state.toast('Find a wall first', 'info');
    }
    if (peeTimer > 0) {
      peeTimer -= dt;
      if (peeTimer <= 0) {
        const fx = -Math.sin(player.facing), fz = -Math.cos(player.facing);
        puddles.add(player.position.x + fx * 0.6, player.position.z + fz * 0.6);
        state.stats.wallsWatered++;
        say('pee_sigh', 1.5);
        if (buildings.inside) buildings.peed();
        else if (crowd.npcs.some((n) => Math.hypot(n.x - player.position.x, n.z - player.position.z) < 10)) setTimeout(() => say('pee_shame', 2.6), 900);
      }
    }
    if (!mohu.active) player.update(dt, input, follow.yaw + drift);
    else mohu.update(dt, input);
    if (!inside()) {
      // Pedestrians and the sweeper are solid; a fast bike into a person is a crash.
      const fast = player.onBike && player.speed > BIKE.crashSpeed;
      if (fast && crowd.hit(player.position.x, player.position.z, 0.35)) player.crashed = true;
      let [nx, nz] = crowd.pushOut(player.position.x, player.position.z, 0.35);
      [nx, nz] = sweeper.pushOut(nx, nz, 0.35);
      [nx, nz] = garbage.pushOut(nx, nz, 0.35);
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
    garbage.update(dt, state.minute, player.position.x, player.position.z);
    traffic.update(dt, state.minute, inside() ? null : { x: player.position.x, z: player.position.z }, lighting.lamps, !inside());
    if (!inside()) {
      const [cx, cz] = traffic.pushOut(player.position.x, player.position.z, 0.35);
      if (cx !== player.position.x || cz !== player.position.z) {
        [player.position.x, player.position.z] = world.resolve(cx, cz, 0.35);
        player.mesh.position.copy(player.position);
      }
    }
    puddles.update(dt);
    returns.update(dt, player.position.x, player.position.z);
    interaction.holdDisabledReason = player.onBike ? 'Get off the bike first (F)' : null;
    interaction.collectBlockedReason = state.starving ? 'Too hungry — buy food at SPAR or Aldi' : null;
    if (tillOpen) interaction.prompt = null;
    else if (!mohu.active) interaction.update(dt, input, player.position.x, player.position.z, player.facing);
    else interaction.prompt = null;
    if (input.wasPressed('KeyM')) minimap.toggleLarge();
  }
  player.mesh.visible = !mohu.active;
  player.setBags(state.bags);
  document.body.classList.toggle('mohu-on', mohu.active);
  if (mohu.active) mohu.camera(camera);
  else if (screen === 'title' || screen === 'scores') {
    // Slow orbit over the neighbourhood behind the menus.
    titleAngle += dt * 0.04;
    camera.position.set(sx + Math.sin(titleAngle) * 260, 150, sz + Math.cos(titleAngle) * 260);
    camera.lookAt(sx, 0, sz);
  } else {
    // Tipsy: a gentle roll and bob.
    const w = state.tipsy && screen === 'run' ? state.tipsyLevel * (lowFx ? 0.5 : 1) : 0;
    follow.roll = w ? Math.sin(state.realTime * 0.8) * 0.035 * w : 0;
    follow.bob = w ? Math.sin(state.realTime * 1.6) * 0.06 * w : 0;
    follow.update(dt, input, player.position);
  }
  tipsyFx.classList.toggle('on', state.tipsy && screen === 'run');
  tipsyFx.classList.toggle('lite', lowFx);
  hungerFill.style.width = `${state.hunger * 100}%`;
  hungerEl.classList.toggle('low', state.hunger < HUNGER.warnAt);
  const [mx, mz] = shops.mapPos() ?? buildings.mapPos(player.position.x, player.position.z);
  minimap.draw(mx, mz, player.facing);
  staminaFill.style.width = `${player.stamina}%`;
  staminaEl.classList.toggle('exhausted', player.exhausted);

  const status: string[] = [];
  if (player.debugFast) status.push('Debug walk');
  if (state.timeScale > 1) status.push(`Time ×${state.timeScale}`);

  if (player.onBike) status.push('On a bike');
  if (state.starving) status.push('Starving!');
  else if (state.hunger < HUNGER.warnAt) status.push('Hungry');
  if (state.tipsy) {
    const left = (state.tipsyUntil - state.minute) / GAME_MIN_PER_SEC;
    status.push(`🍺 Tipsy ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} · P: pee`);
  }
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
