// Every spoken line in the game: Hungarian text, English subtitle, who says it.
// M9 synthesises public/audio/voice/<id>.mp3 for each line with Piper TTS.

export type Speaker = 'granny' | 'grandpa' | 'hazmester' | 'street' | 'player' | 'machine' | 'cashier' | 'driver' | 'zsiga';

export interface Line { id: string; hu: string; en: string; who: Speaker; nightOnly?: boolean; }

export const INTERCOM_LINES: Line[] = [
  { id: 'ic_nem_kerunk', hu: 'Nem kérünk semmit!', en: "We don't want anything!", who: 'granny' },
  { id: 'ic_reklamot', hu: 'Reklámot a postaládába!', en: 'Ads go in the mailbox!', who: 'granny' },
  { id: 'ic_rendorseg', hu: 'Menjen innen, mert hívom a rendőrséget!', en: "Go away or I'm calling the police!", who: 'granny' },
  { id: 'ic_ki_az', hu: 'Ki az? Nem várok senkit.', en: "Who is it? I'm not expecting anyone.", who: 'granny' },
  { id: 'ic_jozsi', hu: 'A Józsi nincs itthon!', en: "Józsi isn't home!", who: 'granny' },
  { id: 'ic_gazoras', hu: 'Megint a gázórás? Múlt héten volt itt!', en: 'The gas man again? He was here last week!', who: 'grandpa' },
  { id: 'ic_ejjel_ketto', hu: 'Fiatalember, éjjel kettő van!', en: "Young man, it's two in the morning!", who: 'granny', nightOnly: true },
  { id: 'ic_tanuk', hu: 'Tanúi vagyunk, köszönjük!', en: "We're Witnesses already, thank you!", who: 'grandpa' },
  { id: 'ic_hallo', hu: 'Hallóóó? ... Hallóóó?', en: 'Hellooo? ... Hellooo?', who: 'granny' },
];

export const LINES: Record<string, Line> = Object.fromEntries([
  ...INTERCOM_LINES,
  { id: 'hz_hey', hu: 'Hé! Maga meg mit keres itt?!', en: 'Hey! What are you doing here?!', who: 'hazmester' },
  { id: 'hz_caught', hu: 'Na, ezt elkobzom! Kifelé!', en: "Right, I'm confiscating this! Out!", who: 'hazmester' },
  { id: 'hz_snore', hu: 'Hhhrrr… zzz…', en: '(snoring through a window)', who: 'hazmester' },
  { id: 'ic_buzz', hu: '(bzzzz)', en: '(the door buzzes open)', who: 'machine' },
  { id: 'st_szia', hu: 'Szia, haver!', en: 'Hi, mate!', who: 'street' },
  // M13: Zsiga, a Bajnok (Zsiga the Champion) at the fire barrel on the Nehru part.
  { id: 'zs_hello', hu: 'Na, haver! Látom, jól megy a gyűjtés.', en: "Well, mate! Collecting's going well, I see.", who: 'zsiga' },
  { id: 'zs_offer', hu: 'Egy menet. Ha nyersz, duplázom a zsákmányodat. Ha veszítesz, az enyém minden, ami nálad van.', en: 'One round. Win and I double your haul. Lose and everything you carry is mine.', who: 'zsiga' },
  { id: 'zs_empty', hu: 'Üres zsákkal nem bunyózunk.', en: "We don't fight over an empty bag.", who: 'zsiga' },
  { id: 'zs_later', hu: 'Ahogy gondolod. Itt leszünk.', en: "Suit yourself. We'll be here.", who: 'zsiga' },
  { id: 'zs_fight', hu: 'HARC!', en: 'FIGHT!', who: 'zsiga' },
  { id: 'zs_win', hu: 'Szép volt, haver!', en: 'Nice one, mate!', who: 'zsiga' },
  { id: 'zs_lose', hu: 'Holnap is itt leszek.', en: "I'll be here tomorrow too.", who: 'zsiga' },
  { id: 'zs_draw', hu: 'Döntetlen. Ezt még lejátsszuk egyszer.', en: "A draw. We'll settle this one day.", who: 'zsiga' },
  { id: 'zs_chat1', hu: 'Melegedj csak, haver. Ma már nem bunyózunk.', en: "Warm yourself up, mate. No more fighting today.", who: 'zsiga' },
  { id: 'zs_chat2', hu: 'A Szabadság hídon túl fúj a szél. Itt jó.', en: "The wind blows past Liberty Bridge. It's nice here.", who: 'zsiga' },
  { id: 'zs_chat3', hu: 'Kérsz egy kortyot? Na, látom, már ittál.', en: "Want a sip? Ah, I see you've had a few already.", who: 'zsiga' },
  { id: 'st_jo_fogas', hu: 'Jó fogást!', en: 'Happy hunting!', who: 'street' },
  { id: 'till_nomoney', hu: 'Nincs elég pénze, kérem.', en: "You don't have enough money.", who: 'cashier' },
  { id: 'till_food', hu: 'Egy párizsis zsemle, tessék.', en: 'One bread roll with párizsi, here you go.', who: 'cashier' },
  { id: 'till_beer', hu: 'Egy sör. Egészségére!', en: 'One beer. Cheers!', who: 'cashier' },
  { id: 'car_vak', hu: 'Nem látsz, haver?!', en: 'Are you blind, mate?!', who: 'driver' },
  { id: 'car_figyelj', hu: 'Figyelj már, te!', en: 'Watch it, you!', who: 'driver' },
  { id: 'pee_shame', hu: 'Nem szégyelli magát?!', en: 'Have you no shame?!', who: 'granny' },
  { id: 'pee_sigh', hu: 'Áhh...', en: '(a relieved sigh)', who: 'player' },
  { id: 'paper_only', hu: 'Csak újság...', en: 'Only newspapers...', who: 'player' },
].map((l) => [l.id, l as Line]));
