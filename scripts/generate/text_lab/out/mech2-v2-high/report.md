# Механики: mech2-v2-high (prompt_mechanics_v2.md, effort high)

Запросов: 1, вопросов: 5, с флагами: 0, стоимость: $0.21

**Beastmaster · Drums of Slom** [how] — Как Primal Roar влияет на аганимный Drums of Slom?
- ✔ Засчитывается как 10 атак и разгоняет барабан  `Drums of Slom:desc`
- · Сразу разгоняет барабан до максимальной скорости  `Drums of Slom:desc`
- · Каждый задетый рёвом юнит засчитывается как атака  `Drums of Slom:invented`
- · Никак, барабан считает только атаки  `Drums of Slom:desc`
- 💬 Primal Roar засчитывается Drums of Slom как 10 атак: это половина пути до максимального темпа, который барабан набирает после 20 атак.

**Invoker · E.M.P.** [interaction] — E.M.P. взрывается, пока враг висит в Tornado. Что будет?
- ✔ Ничего, цель в циклоне его не получает  `E.M.P.:note0`
- · Ману сожжёт, но урон не пройдёт из-за неуязвимости  `E.M.P.:note0`
- · Сработает как обычно: и мана, и урон  `E.M.P.:note0`
- · Эффект отложится и сработает при приземлении  `E.M.P.:note0`
- 💬 E.M.P. полностью игнорирует юнитов в циклоне, будь то Tornado или Eul's, поэтому взрыв нужно рассчитывать на момент приземления.

**Outworld Devourer · Astral Imprisonment** [how] — Что происходит с маной, когда OD крадёт её через Astral Imprisonment?
- ✔ Меняется только максимум маны, текущая ни у кого не двигается  `Astral Imprisonment:note1`
- · OD получает украденное и в максимум, и в текущую ману  `Astral Imprisonment:note1`
- · У цели сгорает текущая мана, а OD получает только максимум  `Astral Imprisonment:note1`
- · OD получает текущую ману, а у цели падает только максимум  `Astral Imprisonment:note1`
- 💬 Кража из Astral Imprisonment сдвигает только максимальную ману: OD не получает текущую ману, и у цели она напрямую не уменьшается.

**Terrorblade · Reflection** [false_fact] — Назовите ложный факт про иллюзии Terrorblade.
- ✔ Иллюзии от Conjure Image выглядят для врага точь-в-точь как Terrorblade  `Conjure Image:note0`
- · Отражение исчезнет, если с героя диспелом снять слоу  `Reflection:note0`
- · Dark Unity даёт бонус к урону и отражениям от Reflection  `Dark Unity:note0`
- · Demon Zeal не действует на отражения от Reflection  `Demon Zeal:desc`
- 💬 Иллюзии от Conjure Image для врага выглядят иначе, чем сам Terrorblade. Остальное — правда: отражение живёт, пока висит слоу, Dark Unity его усиливает, а Demon Zeal на него не действует.

**Shadow Shaman · Fowl Play** [interaction] — Какой летальный урон убьёт Shadow Shaman, даже если Fowl Play готов?
- ✔ Reaper's Scythe  `Fowl Play:note0`
- · Laguna Blade  `Fowl Play:invented`
- · Finger of Death  `Fowl Play:invented`
- · Sun Strike  `Fowl Play:invented`
- 💬 Fowl Play не спасает только от двух добиваний: Reaper's Scythe и Culling Blade. От остального урона, даже чистого, Shaman превращается в курицу.
