// Every text in each language; Swedish is the source and all dictionaries have the same keys
// (checked by i18n.test.ts). Add a language by adding a dictionary and its name.

const sv = {
  'app.title': 'Bagerikoll',
  'app.tagline': 'Under uppbyggnad',
  'beta.badge': 'Beta',
  'nav.today': 'Idag',
  'nav.calendar': 'Kalender',
  'nav.more': 'Mer',
  'today.welcome': 'Välkommen till Bagerikoll',
  'today.building': 'Appen byggs just nu. Här kommer det du gör varje dag att hamna – samma upplägg som i Lönekoll: det viktigaste överst, läget i färgrutor, och detaljerna längre ned.',
  'today.week': 'Den här veckan',
  'cal.thisYear': 'Året',
  'cal.note': 'Varje ruta är en dag. Färgerna fylls i när appen vet vad dagarna ska visa.',
  'more.language': 'Språk',
  'more.theme': 'Utseende',
  'theme.auto': 'Som telefonen',
  'theme.light': 'Ljust',
  'theme.dark': 'Mörkt',
  'more.design': 'Byggstenarna (utseendet)',
  'more.about': 'Om appen',
  'more.aboutText': 'Bagerikoll har samma utseende som Lönekoll. Allt sparas bara i telefonen.',
  'design.title': 'Byggstenarna',
  'design.intro': 'Delarna appens sidor byggs av, med påhittade exempel.',
  'design.focus': 'Ett markerat kort för det som gäller nu',
  'design.chips': 'Chips för läget',
  'design.numbers': 'Stora siffror',
  'design.check': 'Att kolla',
  'design.checkRow': 'Något som behöver en titt',
  'design.squares': 'Färgrutor',
  'design.tiles': 'Rutor med status',
  'design.fold': 'En del som öppnas med ett tryck',
  'design.foldSub': 'en rad om hur det står till',
  'design.foldBody': 'Detaljerna ligger här, ur vägen.',
  'design.notices': 'Meddelanden',
  'design.buttons': 'Knappar',
  'design.example': 'Exempel',
  'design.ok': 'Stämmer',
  'design.warn': 'Att kolla',
  'design.bad': 'Fel',
  'common.back': 'Tillbaka',
};

type Dict = Record<keyof typeof sv, string>;

const en: Dict = {
  'app.title': 'Bagerikoll',
  'app.tagline': 'Being built',
  'beta.badge': 'Beta',
  'nav.today': 'Today',
  'nav.calendar': 'Calendar',
  'nav.more': 'More',
  'today.welcome': 'Welcome to Bagerikoll',
  'today.building': 'The app is being built. What you do every day will go here – laid out as in Lönekoll: the most important first, how things stand in coloured squares, and the details further down.',
  'today.week': 'This week',
  'cal.thisYear': 'The year',
  'cal.note': 'Each square is a day. The colours are filled in once the app knows what the days should show.',
  'more.language': 'Language',
  'more.theme': 'Appearance',
  'theme.auto': 'Like the phone',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'more.design': 'The building blocks (the look)',
  'more.about': 'About',
  'more.aboutText': 'Bagerikoll has the same look as Lönekoll. Everything is stored only on the phone.',
  'design.title': 'The building blocks',
  'design.intro': 'The parts the app’s pages are built from, with made-up examples.',
  'design.focus': 'A highlighted card for what applies now',
  'design.chips': 'Chips for how things stand',
  'design.numbers': 'Big numbers',
  'design.check': 'To check',
  'design.checkRow': 'Something that needs a look',
  'design.squares': 'Coloured squares',
  'design.tiles': 'Tiles with a status',
  'design.fold': 'A part that opens on a tap',
  'design.foldSub': 'a line on how it stands',
  'design.foldBody': 'The details live here, out of the way.',
  'design.notices': 'Notices',
  'design.buttons': 'Buttons',
  'design.example': 'Example',
  'design.ok': 'Matches',
  'design.warn': 'To check',
  'design.bad': 'Wrong',
  'common.back': 'Back',
};

export type TextKey = keyof typeof sv;
export type Language = 'sv' | 'en';
export const DICTIONARIES: Record<Language, Dict> = { sv, en };
export const LANGUAGE_NAMES: Record<Language, string> = { sv: 'Svenska', en: 'English' };
export type Translate = (key: TextKey, values?: Record<string, string | number>) => string;

export function translator(lang: Language): Translate {
  const dict = DICTIONARIES[lang];
  return (key, values) => {
    let text = dict[key] ?? sv[key] ?? key;
    if (values) for (const [k, v] of Object.entries(values)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  };
}
