// server/src/game/questions/categories.ts
// Категории и подкатегории вопросов — что выпадает и как часто. Здесь решает автор игры, размер банка в вес не
// входит: он задаёт только, как быстро колода подкатегории проходит круг (таблица — npm run ratios).
//
// Раунд: режим по циклу (all → kerri → closest) → тип вопроса (mc для all / kerri, closest) → категория по весу
// среди тех, у кого есть подкатегории этого типа → подкатегория по весу внутри категории → вопрос из колоды.
// Выбор сглажен (smooth.ts): доли за длинную дистанцию точные, серии одной категории реже, чем у чистого рандома.
// Оценки игроков слабо двигают веса категории и подкатегории (ratings.ts).
//
// id подкатегорий: готовые вопросы — поле `sub` в scripts/data/bank/questions.json; статистика — id из
// scripts/data/stats/bank.json; друзья — типы из friends.ts.

export interface SubcategoryDef {
  id: string
  title: string
  weight?: number   // внутри категории; по умолчанию 1
}

export interface CategoryDef {
  id: string
  title: string
  weight: number
  /** friends — вес только когда в лобби опознаны ≥ 2 человека из компании */
  requires?: 'friends'
  subs: SubcategoryDef[]
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'hero_numbers', title: 'Числа героев', weight: 1, subs: [
      { id: 'hero_damage', title: 'Урон способностей' },
      { id: 'hero_time', title: 'Длительности и кулдауны' },
      { id: 'hero_pct', title: 'Проценты способностей' },
      { id: 'hero_other', title: 'Прочие числа способностей' },
    ],
  },
  {
    id: 'items', title: 'Предметы', weight: 1, subs: [
      { id: 'costs', title: 'Цены' },
      { id: 'item_numbers', title: 'Числа предметов' },
      { id: 'neutrals', title: 'Нейтралки и чары' },
    ],
  },
  {
    id: 'mechanics', title: 'Механики', weight: 1, subs: [
      { id: 'mech_how', title: 'Как работает' },
      { id: 'mech_interaction', title: 'Взаимодействия' },
      { id: 'mech_false_fact', title: 'Ложный факт' },
      { id: 'talents_has', title: 'Таланты героя' },
    ],
  },
  {
    id: 'match_avg', title: 'Средние за матч', weight: 1, subs: [
      { id: 'avg_heal_allies', title: 'Хил союзникам' },
      { id: 'avg_heal_self', title: 'Самолечение' },
      { id: 'avg_tower', title: 'Урон по строениям' },
      { id: 'avg_hero_damage', title: 'Урон по героям' },
      { id: 'avg_kills', title: 'Убийства' },
      { id: 'avg_cs', title: 'Добивания' },
    ],
  },
  {
    id: 'meta', title: 'Мета героев', weight: 1, subs: [
      { id: 'hero_wr', title: 'Винрейт на патче', weight: 2 },
      { id: 'hero_pick', title: 'Пики на патче', weight: 2 },
      { id: 'hero_pick_closest', title: 'Пики на патче' },
      { id: 'hero_pick_year', title: 'Пики за год' },
      { id: 'hero_pick_all', title: 'Пики за всё время' },
      { id: 'bans', title: 'Баны' },
      { id: 'bans_closest', title: 'Баны' },
      { id: 'counter', title: 'Контрпики', weight: 2 },
      { id: 'talents', title: 'Таланты 20 и 25', weight: 2 },
    ],
  },
  {
    id: 'match_items', title: 'Предметы в матчах', weight: 1, subs: [
      { id: 'items', title: 'Популярные предметы' },
      { id: 'items_hero', title: 'Предметы героя', weight: 2 },
      { id: 'boots_hero', title: 'Ботинки героя' },
    ],
  },
  {
    id: 'friends', title: 'Друзья', weight: 1, requires: 'friends', subs: [
      { id: 'friends_hero_main', title: 'Мейн' },
      { id: 'friends_hero_wr', title: 'Лучший и худший герой' },
      { id: 'friends_self_wr', title: 'Винрейт на герое' },
      { id: 'friends_hero_games', title: 'Игры на герое' },
      { id: 'friends_pair_games', title: 'Игры вместе' },
      { id: 'friends_pair_top', title: 'Главный напарник' },
    ],
  },
]
