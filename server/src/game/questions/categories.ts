// server/src/game/questions/categories.ts
// Категории и подкатегории вопросов — что выпадает, как часто и как называется тема. Здесь решает автор игры, размер
// банка в вес не входит: он задаёт только, как быстро колода подкатегории проходит круг (таблица — npm run ratios).
//
// Раунд: режим по циклу (all → kerri → closest) → тип вопроса (mc для all / kerri, closest) → категория по весу
// среди тех, у кого есть подкатегории этого типа → подкатегория по весу внутри категории → вопрос из колоды.
// Выбор сглажен (smooth.ts): доли за длинную дистанцию точные, серии одной категории реже, чем у чистого рандома.
// Оценки игроков двигают веса категории и подкатегории (picker.ts, relativeMultipliers) — одна оценка на id, для
// обоих типов сразу.
//
// Веса: `weight` — базовый (MC), `closest` — вес в «кто ближе», если отличается (нет — тот же weight).
//
// Тема вопроса — две строки: субъект (кто / что: герой, предмет, ник, «Герои») и аспект строчными (о чём, 1–2 слова),
// без патча и уточнений: «Lion\nспособности», «Герои\nубийства», «Heart of Tarrasque» (у предметов аспекта нет:
// тема не должна выдавать, что будет цена). Субъект даёт источник (поле topic банка, герой вопроса статистики, ник
// друга); `subject` здесь — постоянный субъект подкатегории, он главнее источника (в «Пики» герой вопроса не
// раскрывается). Аспект — `aspect` здесь; вопрос банка может его переопределить (нейтралки: «чара» у чар).
// Склейка — одна, в picker.ts (decorate), формат — shared/src/topic.ts.
//
// id подкатегорий: готовые вопросы — поле `sub` в scripts/data/bank/questions.json; статистика — id из
// scripts/data/stats/bank.json; друзья — типы из friends.ts. id не переименовывать: по ним в Neon ключи колод,
// кредитов и оценок.

export interface SubcategoryDef {
  id: string
  /** заголовок в лаборатории /dev и таблице соотношений */
  title: string
  /** вес внутри категории; по умолчанию 1 */
  weight?: number
  /** вес в «кто ближе», если отличается от weight */
  closest?: number
  /** постоянный субъект темы — главнее субъекта источника */
  subject?: string
  /** вторая строка темы — о чём вопрос */
  aspect?: string
}

export interface CategoryDef {
  id: string
  title: string
  weight: number
  /** вес в «кто ближе», если отличается от weight */
  closest?: number
  /** friends — вес только когда в лобби опознаны ≥ 2 человека из компании */
  requires?: 'friends'
  subs: SubcategoryDef[]
}

const HEROES = 'Герои'

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'hero_numbers', title: 'Числа героев', weight: 1, subs: [
      { id: 'hero_damage', title: 'Урон способностей', aspect: 'способности' },
      { id: 'hero_time', title: 'Длительности и кулдауны', aspect: 'способности' },
      { id: 'hero_pct', title: 'Проценты способностей', aspect: 'способности' },
      { id: 'hero_other', title: 'Прочие числа способностей', aspect: 'способности' },
    ],
  },
  {
    // тема — только предмет: по ней не видно, что спросят цену
    id: 'items', title: 'Предметы', weight: 1, subs: [
      { id: 'costs', title: 'Цены', closest: 2 },
      { id: 'item_numbers', title: 'Числа предметов' },
      { id: 'neutrals', title: 'Нейтралки и чары', aspect: 'нейтралка' },   // у чар банк ставит «чара»
    ],
  },
  {
    id: 'mechanics', title: 'Механики', weight: 1.5, subs: [
      { id: 'mech_how', title: 'Как работает', aspect: 'механика' },
      { id: 'mech_interaction', title: 'Взаимодействия', aspect: 'механика' },
      { id: 'mech_false_fact', title: 'Ложный факт', aspect: 'механика' },
      { id: 'talents_has', title: 'Таланты героя', weight: 1.5, aspect: 'таланты' },
    ],
  },
  {
    id: 'match_avg', title: 'Средние за матч', weight: 1.2, closest: 1, subs: [
      { id: 'avg_heal_allies', title: 'Хил союзникам', subject: HEROES, aspect: 'хил союзникам' },
      { id: 'avg_heal_self', title: 'Самолечение', subject: HEROES, aspect: 'самолечение' },
      { id: 'avg_tower', title: 'Урон по строениям', subject: HEROES, aspect: 'урон по строениям' },
      { id: 'avg_hero_damage', title: 'Урон по героям', subject: HEROES, aspect: 'урон по героям' },
      { id: 'avg_kills', title: 'Убийства', subject: HEROES, aspect: 'убийства' },
      { id: 'avg_cs', title: 'Добивания', subject: HEROES, aspect: 'добивания' },
    ],
  },
  {
    id: 'meta', title: 'Мета героев', weight: 1, closest: 0.6, subs: [
      { id: 'hero_wr', title: 'Винрейт', weight: 2, subject: HEROES, aspect: 'винрейт' },
      // пики в MC делят одну часть: на патче — половина, за год и с 2014 года — по четверти
      { id: 'hero_pick', title: 'Пики на патче', weight: 1, subject: HEROES, aspect: 'пики' },
      { id: 'hero_pick_year', title: 'Пики за год', weight: 0.5, subject: HEROES, aspect: 'пики' },
      { id: 'hero_pick_all', title: 'Пики с 2014 года', weight: 0.5, subject: HEROES, aspect: 'пики' },
      // герой вопроса в теме не раскрывается — иначе тема повторяет вопрос
      { id: 'hero_pick_closest', title: 'Пики на патче, % матчей', subject: HEROES, aspect: 'пики' },
      { id: 'bans', title: 'Баны', subject: HEROES, aspect: 'баны' },
      { id: 'bans_closest', title: 'Баны, % матчей', subject: HEROES, aspect: 'баны' },
      { id: 'counter', title: 'Контрпики', weight: 2, aspect: 'контрпики' },
      { id: 'talents', title: 'Таланты 20 и 25', weight: 2, aspect: 'таланты' },
    ],
  },
  {
    id: 'match_items', title: 'Предметы в матчах', weight: 0.7, subs: [
      { id: 'items', title: 'Популярность', subject: 'Предметы', aspect: 'популярность' },
      { id: 'items_hero', title: 'Предметы героя', aspect: 'предметы' },
      { id: 'boots_hero', title: 'Ботинки героя', weight: 0.6, aspect: 'предметы' },
    ],
  },
  {
    id: 'friends', title: 'Друзья', weight: 1, requires: 'friends', subs: [
      { id: 'friends_hero_main', title: 'Мейн', aspect: 'герои' },
      { id: 'friends_hero_wr', title: 'Лучший и худший герой', aspect: 'герои' },
      { id: 'friends_self_wr', title: 'Винрейт на герое', aspect: 'винрейт' },
      { id: 'friends_hero_games', title: 'Игры на герое', aspect: 'игры' },
      { id: 'friends_pair_games', title: 'Игры вместе' },   // тема — «ник1 и ник2», без аспекта
      { id: 'friends_pair_top', title: 'Тиммейты', aspect: 'тиммейты' },
    ],
  },
]
