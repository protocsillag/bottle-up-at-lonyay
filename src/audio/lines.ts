// Every spoken line in the game: Hungarian text, English subtitle, who says it.
// M9 synthesises public/audio/voice/<id>.mp3 for each line with Piper TTS.

export type Speaker = 'granny' | 'grandpa' | 'hazmester' | 'street' | 'player' | 'machine' | 'cashier' | 'driver';

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
