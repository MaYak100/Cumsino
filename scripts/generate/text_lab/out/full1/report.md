# Механики: full1 (prompt_mechanics_v3.md, effort high)

Запросов: 26, вопросов: 127, с флагами: 2, стоимость: $5.31

**Bounty Hunter · Track** [false_fact] — Назовите ложный факт про Track.
- ✔ Бонусное золото за Track — ненадёжное  `Track:note3`
- · Золото за Track дадут, даже если цель добила башня  `Track:note0`
- · Каст Track не выводит Bounty Hunter из инвиза  `Track:desc`
- · Track снимается обычным диспелом  `Track:dispellable`
- 💬 Бонус за Track — надёжное золото, и его дают при любой смерти цели под Track, даже если добила башня или крип.

**Rubick · Telekinesis** [how] — Что происходит с самой целью Telekinesis, когда она приземляется?
- ✔ Ничего, стан от приземления её не цепляет  `Telekinesis:note1`
- · Получает тот же стан, что и враги вокруг  `Telekinesis:note1`
- · Получает стан короче, чем враги вокруг  `Telekinesis:invented`
- · Получает стан, только если её бросили в сторону  `Telekinesis:invented`
- 💬 Стан от приземления достаётся только врагам рядом — сама поднятая цель его не получает.

**Lion · Earth Spike** [interaction] — Lion кидает Earth Spike прямо в героя с Linken's Sphere. Что будет?
- ✔ Спайк застанит его, а Linken's Sphere не сработает  `Earth Spike:note1`
- · Linken's Sphere заблокирует, но спайк полетит дальше по линии  `Earth Spike:note1`
- · Linken's Sphere заблокирует, и спайк пропадёт  `Earth Spike:note1`
- · Спайк застанит его, но Linken's Sphere всё равно уйдёт в кд  `Earth Spike:note1`
- 💬 Earth Spike не вызывает ни блок, ни отражение спеллов: Linken's Sphere просто игнорируется и остаётся целой.

**Nyx Assassin · Spiked Carapace** [how] — Какой урон Spiked Carapace возвращает атакующему?
- ✔ Того же типа, в размере урона после всех снижений  `Spiked Carapace:note2`
- · Того же типа, в размере урона до брони и маг. резиста  `Spiked Carapace:note0`
- · Чистый, в размере урона после всех снижений  `Spiked Carapace:note2`
- · Чистый, в размере урона до брони и маг. резиста  `Spiked Carapace:note0`
- 💬 Carapace возвращает ровно то, что Nyx получил бы после всех снижений, и того же типа, с которым урон пришёл.

**Earthshaker · Enchant Totem** [how] — От чего считается бонусный урон Enchant Totem?
- ✔ От базового урона и урона от основного атрибута  `Enchant Totem:note0`
- · От всего урона, включая предметы  `Enchant Totem:note0`
- · Только от базового урона, без атрибутов  `Enchant Totem:note0`
- · От базового урона и бонусов урона с предметов  `Enchant Totem:note0`
- 💬 Totem усиливает только базовый урон и урон от силы — бонусный урон с предметов в расчёт не идёт.

**Ancient Apparition · Ice Blast** [false_fact] — Назовите ложный факт про Ice Blast.
- ✔ Time Lapse не вернёт хп, пока висит Ice Blast  `Ice Blast:note4`
- · Release можно нажать под сайленсом  `Release:desc`
- · Фонтан не лечит цель под Ice Blast  `Ice Blast:note4`
- · Килл за раскол получает тот, чей урон его вызвал  `Ice Blast:note2`
- 💬 Ice Blast блокирует почти всё лечение, даже фонтан, но Sunder, Time Lapse и Supernova всё равно работают.

**Shadow Demon · Disseminate** [interaction] — Что из кита Shadow Demon не действует, пока цель спрятана в Disruption?
- ✔ Disseminate раздаёт урон соседям  `Disseminate:desc`
- · Shadow Poison вешает стаки  `Shadow Poison:note0`
- · Demonic Purge накладывается на врага  `Demonic Purge:desc`
- · Demonic Cleanse накладывается на союзника  `Demonic Cleanse:desc`
- 💬 Пока цель в Disruption, эффект Disseminate на паузе, а Shadow Poison, Purge и Cleanse по ней проходят.

**Shadow Demon · Menace** [how] — Что брейк делает с Menace?
- ✔ Новые стаки не вешаются, старые продолжают работать  `Menace:note0`
- · Все висящие стаки сразу снимаются  `Menace:note1`
- · Стаки вешаются, но не усиливают урон  `Menace:note1`
- · Ничего, врождённые способности брейк не трогает  `Menace:note0`
- 💬 Брейк мешает Shadow Demon вешать новые стаки Menace, но уже наложенные продолжают увеличивать получаемый урон.

**Tinker · Warp Flare** [how] — Как дальность телепорта Warp Flare зависит от позиции цели?
- ✔ Чем ближе цель к Tinker, тем дальше её кидает  `Warp Flare:desc`
- · Чем дальше цель от Tinker, тем дальше её кидает  `Warp Flare:note0`
- · Цель всегда кидает на одно и то же расстояние  `Warp Flare:note0`
- · Цель всегда кидает на край каст-ренжа флейра  `Warp Flare:note0`
- 💬 Вплотную Warp Flare отбрасывает цель на 60% своего каст-ренжа, а на максимальной дистанции телепорта нет совсем.

**Keeper of the Light · Chakra Magic** [how] — Какие кд сокращает Chakra Magic?
- ✔ Только базовых способностей, которые на кд  `Chakra Magic:note0`
- · Всех способностей, включая ульту  `Chakra Magic:note0`
- · Базовых способностей и предметов  `Chakra Magic:desc`
- · Только последней использованной способности  `Chakra Magic:desc`
- 💬 Chakra Magic сокращает на фиксированное значение кд всех базовых способностей цели, которые сейчас на кд; ульту и предметы не трогает.

**Gyrocopter · Rocket Barrage** [false_fact] — Назовите ложный факт про Gyrocopter.
- ✔ Rocket Barrage от шардовой Homing Missile даёт Afterburner  `Rocket Barrage:note1`
- · Homing Missile догонит и ударит невидимого врага  `Homing Missile:note2`
- · Side Gunner стреляет, даже когда Gyro в стане  `Side Gunner:note0`
- · Прицел Homing Missile видят только союзники Gyro  `Homing Missile:note1`
- 💬 Ракеты Rocket Barrage, которые выпускает шардовая Homing Missile, не включают Afterburner, а остальные три факта верны.

**Lycan · Shapeshift** [interaction] — Lycan в Shapeshift попадает под хекс. С какой скоростью он бегает?
- ✔ С той же скоростью, что и в форме волка  `Shapeshift:note0`
- · С фиксированной скоростью хекса, как все  `Shapeshift:note0`
- · Со скоростью хекса: форма волка спадает  `Shapeshift:dispellable`
- · Сохраняет скорость волка, но только ночью  `Shapeshift:note0`
- 💬 Хекс не отнимает у Lycan скорость передвижения от Shapeshift: зверёк носится так же быстро, как волк.

**Axe · Counter Helix** [interaction] — У Axe есть Aghanim's Scepter. Как растёт счётчик Counter Helix у его иллюзий?
- ✔ Только от атак по самой иллюзии  `Counter Helix:note1`
- · И от атак по ней, и от её собственных атак, как у Axe  `Counter Helix:note1`
- · У иллюзий общий счётчик с Axe  `none:invented`
- · Иллюзии вообще не делают Counter Helix  `none:invented`
- 💬 С аганимом счётчик Axe растёт и от его собственных атак, но у иллюзий атаки счётчик не двигают, только удары по ним.

**Invoker · E.M.P.** [false_fact] — Назовите ложный факт про способности Invoker.
- ✔ E.M.P. сжигает ману и врагам, висящим в Tornado  `E.M.P.:note0`
- · Перестановка уже собранных спеллов через Invoke не тратит ману и не уходит в кд  `Invoke:note1`
- · Опыт за убийство Sun Strike приходит, даже если Invoker на другом конце карты  `Sun Strike:note1`
- · Сферы можно прожимать во время канала, и инвиз они не сбивают  `Quas:note1`
- 💬 E.M.P. не действует на юнитов в циклоне, будь то Tornado или Eul's, поэтому комбо «торнадо + EMP» требует точного тайминга.

**Silencer · Last Word** [how] — Враг под Last Word начинает кастовать канальную способность. Что будет?
- ✔ Last Word сработает, когда канал закончится  `Last Word:note0`
- · Last Word сработает сразу и собьёт канал  `Last Word:note0`
- · Last Word сработает сразу, но канал продолжится  `Last Word:note0`
- · Канальные спеллы Last Word не триггерят  `Last Word:note0`
- 💬 Канальные способности триггерят Last Word только после окончания канала, так что канал он не сбивает.

**Silencer · Global Silence** [interaction] — Враг под Global Silence прожимает BKB. Что будет с сайленсом?
- ✔ Сайленс спадёт  `Global Silence:note0`
- · Ничего: ульта пробивает невосприимчивость к магии  `Global Silence:bkbpierce`
- · Спадёт, только если BKB выпит до каста ульты  `Global Silence:note0`
- · Сайленс останется, но его таймер встанет на паузу  `Arcane Curse:desc`
- 💬 Global Silence вешается даже на тех, кто уже под BKB, но если получить невосприимчивость во время сайленса, он снимается.

**Morphling · Ebb and Flow** [how] — Morphling превратился Morph'ом в мили-героя. Какие бонусы Ebb and Flow у него остаются?
- ✔ Все, кроме бонуса к дальности атаки  `Ebb and Flow:note0`
- · Все, включая бонус к дальности атаки  `Ebb and Flow:note0`
- · Никаких: они работают только в своей форме  `Ebb and Flow:desc`
- · Только бонусы от силы: каст-рейндж и резист к слоу  `Ebb and Flow:desc`
- 💬 Бонусы Ebb and Flow сохраняются в морфе, но дальность атаки добавляется, только если Morphling превратился в ренж-героя.

**Bloodseeker · Thirst** [false_fact] — Назовите ложный факт про Thirst.
- ✔ Бонусы от нескольких раненых героев не складываются, работает сильнейший  `Thirst:desc`
- · Раненые иллюзии никаких бонусов не дают  `Thirst:note0`
- · Если раненый герой умер, бонусы держатся ещё немного  `Thirst:note2`
- · Она снимает ограничение на максимальную скорость передвижения  `Thirst:desc`
- 💬 Бонусы Thirst считаются отдельно за каждого раненого героя и складываются, а после смерти цели ещё ненадолго остаются.

**Disruptor · Kinetic Field** [interaction] — Кто из врагов Disruptor сможет выйти из Kinetic Field?
- ✔ Союзник Omniknight под Repel  `Kinetic Field:note0`
- · Союзник Omniknight под Guardian Angel  `Guardian Angel:desc`
- · Winter Wyvern под Arctic Burn  `none:invented`
- · Bloodseeker под Bloodrage  `none:invented`
- 💬 Сквозь Kinetic Field проходят только юниты с невосприимчивостью к дебаффам, а Repel её как раз даёт; свободное передвижение и иммунитет к физ. урону не помогают.

**Vengeful Spirit · Retribution** [how] — Как работает Retribution после того, как Vengeful Spirit убили?
- ✔ Vengeful бьёт своего убийцу сильнее, пока тот не умрёт  `Retribution:desc`
- · Vengeful бьёт своего убийцу сильнее, пока сама его не убьёт  `Retribution:desc`
- · Вся команда Vengeful бьёт её убийцу сильнее, пока тот не умрёт  `Retribution:desc`
- · Каждая новая смерть от того же героя усиливает бонус  `Retribution:desc`
- 💬 Бонус к урону по убийце получает только сама Vengeful, держится до любой следующей смерти убийцы и не стакается: дебафф может быть только один.

**Omniknight · Guardian Angel** [how] — Что даёт Aghanim's Scepter для Guardian Angel?
- ✔ Глобальный радиус, действие на здания и усиленное лечение  `Guardian Angel:scepter`
- · Глобальный радиус и действие на здания  `Guardian Angel:scepter`
- · Глобальный радиус, действие на здания и развеивание дебаффов  `Guardian Angel:scepter`
- · Глобальный радиус и защиту ещё и от магического урона  `Guardian Angel:scepter`
- 💬 Аганим делает Guardian Angel глобальным, распространяет его на здания и вдобавок усиливает всё восстановление здоровья.

**Winter Wyvern · Winter's Curse** [interaction] — Winter Wyvern кастует Winter's Curse, а рядом с целью стоит враг под BKB. Что с ним будет?
- ✔ Его не проклянёт: невосприимчивость пробивается только у главной цели  `Winter's Curse:note1`
- · Его проклянёт, как и всех вокруг  `Winter's Curse:note1`
- · Его проклянёт, но без бонусной скорости атаки  `none:invented`
- · Его проклянёт, но урон от врагов по нему будет проходить  `none:invented`
- 💬 Winter's Curse пробивает невосприимчивость к магии только у замороженной цели, а враги вокруг под BKB проклятия не получают.

**Abaddon · Borrowed Time** [false_fact] — Назовите ложный факт про Borrowed Time.
- ✔ Под сайленсом он не сработает автоматически  `Borrowed Time:note0`
- · Его можно прожать вручную, стоя в стане  `Borrowed Time:note0`
- · Под брейком он не сработает автоматически  `Borrowed Time:note2`
- · Свой Aphotic Shield не мешает ему лечиться от урона  `Borrowed Time:note1`
- 💬 Сайленс мешает только ручному касту: пассивное срабатывание под сайленсом происходит, а вот брейк его блокирует.

**Arc Warden · Tempest Double** [interaction] — Шардовый Tempest Double появляется с бонусами Arcane, Invisibility и Haste рун. Что это даёт по Runic Infusion?
- ✔ Ничего, это не считается активацией руны  `Tempest Double:shard`
- · Атрибуты за каждую из трёх рун  `Tempest Double:shard`
- · Атрибуты один раз за каждый каст  `Tempest Double:shard`
- · Атрибуты только копии, а не самому Arc Warden  `Runic Infusion:desc`
- 💬 В описании шарда прямо сказано: бонусы рун при создании копии Runic Infusion не триггерят.

**Warlock · Upheaval** [how] — Upheaval кастуется уже долго, и тут в зону забегает враг. Насколько сильно его замедлит?
- ✔ Сразу на всё, что накопилось за время каста  `Upheaval:note0`
- · Сначала слабо, и слоу растёт, пока он стоит в зоне  `Upheaval:note0`
- · Сначала слабо, но догонит накопленное вдвое быстрее  `Upheaval:invented`
- · На половину накопленного, остальное — пока стоит в зоне  `Upheaval:invented`
- 💬 Сила слоу Upheaval зависит от длительности каста, а не от того, сколько враг простоял в зоне.

**Centaur Warrunner · Hoof Stomp** [how] — Что Centaur может делать во время замаха Hoof Stomp?
- ✔ Ходить, но не бить  `Hoof Stomp:desc`
- · Ничего, он стоит в анимации  `Hoof Stomp:desc`
- · Бить, но не ходить  `Hoof Stomp:desc`
- · И ходить, и бить  `Hoof Stomp:desc`
- 💬 Во время задержки перед ударом Centaur получает дизарм, но может двигаться — поэтому стомп можно донести до врага.

**Broodmother · Spawn Spiderlings** [how] — При каком условии из цели Spawn Spiderlings вылупятся паучки?
- ✔ Если она умрёт, даже когда слоу уже спал  `Spawn Spiderlings:note0`
- · Только если умрёт, пока на ней висит слоу  `Spawn Spiderlings:note0`
- · Только если её добьёт Broodmother или паучок  `Spawn Spiderlings:invented`
- · Только если рядом с ней в момент смерти стоит Broodmother  `Spider's Milk:invented`
- 💬 Слоу длится 4 секунды, а паучки вылупятся, если цель умрёт в течение 20 секунд после попадания — кто бы её ни добил.

**Storm Spirit · Galvanized** [interaction] — Что делает брейк с Galvanized у Storm Spirit?
- ✔ Перестают копиться заряды за убийства  `Galvanized:note0`
- · Пропадает весь реген маны от зарядов  `Galvanized:note0`
- · Перестают копиться заряды и за убийства, и за уровни  `Galvanized:note0`
- · Ничего — врождённую брейк не трогает  `Galvanized:note0`
- 💬 Под брейком Galvanized просто не даёт новые заряды за убийства — накопленный реген остаётся, а заряды за уровни идут как обычно.

**Tidehunter · Anchor Smash** [false_fact] — Назовите ложный факт про Anchor Smash.
- ✔ Он режет урон атаки Roshan, как и любому крипу  `Anchor Smash:note0`
- · Он режет урон атаки древним крипам  `Anchor Smash:note0`
- · Anchor Smash от очищения Kraken Shell не даёт лайфстила  `Anchor Smash:note1`
- · Anchor Smash от очищения Kraken Shell нельзя отразить Blade Mail  `Anchor Smash:note1`
- 💬 Anchor Smash работает на всех древних, кроме Roshan, а удар от Kraken Shell считается отражённым уроном: без лайфстила и без повторного отражения.

**Kez · Kazurai Katana** [how] — Когда импейл Kazurai Katana с Aghanim's Shard станит цель?
- ✔ Если удар приходится со спины  `Kazurai Katana:shard`
- · Если на цели висит Mark  `Shodo Sai:desc`
- · Если на цели максимум стаков катаны  `Kazurai Katana:shard`
- · Если это первый удар после смены оружия  `Switch Discipline:desc`
- 💬 С шардом импейл станит только при ударе со спины; стан по Mark — это механика Sai, а первый удар после смены даёт лишь бонусный урон.

**Largo · Croak of Genius** [how] — Какой урон союзника повторяет Croak of Genius?
- ✔ Только тот, что усиливается спелл-ампом  `Croak of Genius:note0`
- · Любой, включая обычные атаки  `Croak of Genius:note0`
- · Только магический урон  `Croak of Genius:note0`
- · Только урон способностей, но не предметов  `Croak of Genius:note0`
- 💬 Croak повторяет только урон, на который действует спелл-амп, — значит и чистые спеллы, и предметы вроде Dagon, но не атаки.

**Brewmaster · Primal Split** [how] — Earth уже погиб, Storm и Fire дожили до конца Primal Split. Где появится Brewmaster?
- ✔ На месте Storm  `Primal Split:note2`
- · На месте Fire  `Primal Split:note2`
- · На месте панды с наибольшим хп  `Primal Split:invented`
- · Там, где кастовал ультимейт  `Primal Split:note2`
- 💬 Brewmaster встаёт на место живой панды строго по порядку: Earth, затем Storm, затем Fire.

**Largo · Catchy Lick** [whose] — Чья способность даёт владельцу реген хп, если снять ею эффект с цели?
- ✔ Catchy Lick  `Catchy Lick:desc`
- · Raptor Dance  `Raptor Dance:desc`
- · Kraken Shell  `Kraken Shell:desc`
- · Raven's Veil  `Raven's Veil:desc`
- 💬 Catchy Lick накладывает базовый диспел, и если он что-то снял (или убил цель), Largo получает временный реген хп; Raptor Dance лечит от урона, а не от диспела.

**Earth Spirit · Stone Remnant** [how] — Как Stone Remnant влияет на урон Earth Spirit?
- ✔ Урон за каждый неиспользованный заряд и бонус, когда способность применена на камень  `Stone Remnant:desc`
- · Урон за каждый камень на карте и бонус, когда способность применена на камень  `Stone Remnant:desc`
- · Урон за каждый неиспользованный заряд и бонус, пока рядом стоит камень  `Stone Remnant:desc`
- · Урон за каждый камень на карте и бонус, пока рядом стоит камень  `Stone Remnant:desc`
- 💬 Пассивный бонус идёт за каждый неистраченный заряд, а ещё 7.5% на 10 секунд дают, когда любой способностью цепляешь камень."}]}

**Terrorblade · Demon Zeal** [false_fact] — Назовите ложный факт про иллюзии Terrorblade.
- ✔ Demon Zeal ускоряет и иллюзии от Reflection  `Demon Zeal:desc`
- · Dark Unity усиливает и иллюзии от Reflection  `Dark Unity:note0`
- · Враги видят иллюзии Conjure Image не так, как союзники  `Conjure Image:note0`
- · Отражение пропадает, если с цели развеять слоу  `Reflection:note0`
- 💬 Demon Zeal прямо исключает отражения, а вот Dark Unity добавляет им урон; отражение живёт, пока висит слоу от Reflection.

**Outworld Devourer · Astral Imprisonment** [how] — Что на самом деле происходит с маной при краже от Astral Imprisonment?
- ✔ Меняется только максимум, текущая мана ни у кого не трогается  `Astral Imprisonment:note1`
- · OD получает текущую ману, у цели падает только максимум  `Astral Imprisonment:note1`
- · У цели сгорает текущая мана, но OD её не получает  `Astral Imprisonment:note1`
- · OD получает текущую ману, а у цели она сгорает  `Astral Imprisonment:note1`
- 💬 Кража меняет только максимум маны: текущая мана OD не растёт, а у жертвы напрямую не сгорает.

**Phoenix · Sun Ray** [interaction] — Что из этого прервёт Sun Ray?
- ✔ Сайленс  `Sun Ray:note1`
- · Рут  `Sun Ray:note1`
- · Каст Icarus Dive  `Sun Ray:note2`
- · Использование предмета  `Sun Ray:note2`
- 💬 Sun Ray сбивают стан, сайленс, циклон, хекс и сон, а свои способности и предметы Phoenix использует, не прерывая луча.

**Witch Doctor · Maledict** [how] — Что будет с бурстом Maledict, если цель отхилилась выше того хп, что было при наложении?
- ✔ Бурст нанесёт ноль урона  `Maledict:note0`
- · Бурст посчитается от самой низкой точки хп за проклятие  `Maledict:note0`
- · Бурст учтёт весь полученный урон, хил не вычтется  `Maledict:note0`
- · Проклятие досрочно спадёт с цели  `none:invented`
- 💬 Бурст считается от разницы с хп в момент каста: если цель отхилилась выше, бурст равен нулю, но само проклятие остаётся.

**Phoenix · Dying Light** [whose] — Чья это механика: урон по площади вокруг героя растёт, чем меньше хп осталось у самого героя?
- ✔ Dying Light  `Dying Light:desc`
- · Sun Ray  `Sun Ray:desc`
- · Maledict  `Maledict:desc`
- · Sunder  `Sunder:desc`
- 💬 Dying Light каждую секунду наносит врагам в радиусе 400 урон, равный 3.5% от недостающего хп Phoenix, и работает даже в Supernova.

**Mars · Spear of Mars** [how] — Mars стоит на возвышенности, и Spear of Mars тащит героя к краю обрыва, за которым низина. Что произойдёт?
- ✔ Сбросит его вниз без стана  `Spear of Mars:note1`
- · Пригвоздит к краю обрыва со станом  `Spear of Mars:note1`
- · Остановит у края без стана  `Spear of Mars:note1`
- · Сбросит вниз и застанит у подножия  `Spear of Mars:note1`
- 💬 Копьё пригвождает только к обрыву, ведущему на возвышенность; если дальше низина, цель просто сбрасывает вниз без стана.

**Lich · Sacrifice** [false_fact] — Назовите ложный факт про кит Lich.
- ✔ Крип, съеденный Sacrifice, не даёт опыта врагам  `Sacrifice:note1`
- · Chain Frost нельзя задоджить  `Chain Frost:note0`
- · Frost Shield можно повесить на башню  `Frost Shield:note1`
- · Chain Frost не прыгает на зомби Undying  `Chain Frost:note2`
- 💬 Sacrifice засчитывается как денай, поэтому враги рядом всё равно получают опыт за денай, и он не зависит от опыта самого Lich.

**Tusk · Snowball** [interaction] — Союзный Meepo с клонами залез в Snowball. Что будет?
- ✔ Поедут все клоны, и каждый добавит урон  `Snowball:note3`
- · Поедут все клоны, но урон добавит только оригинал  `Snowball:note3`
- · Поедет только оригинал, клоны останутся  `Snowball:note2`
- · Поедут все, но клоны не добавят ни урона, ни стана  `Snowball:note3`
- 💬 Иллюзии в снежок не садятся, а клоны Meepo садятся, и каждый добавляет свой бонус к урону.

**Mirana · Starstorm** [how] — Как Starstorm работает против невидимых врагов в радиусе?
- ✔ Вообще их не задевает  `Starstorm:note1`
- · Бьёт волной, но второй метеор их не выбирает  `Starstorm:note1`
- · Бьёт и раскрывает их на мгновение  `Starstorm:note1`
- · Бьёт, но без раскрытия, как Sacred Arrow  `Starstorm:note1`
- 💬 В отличие от Sacred Arrow, Starstorm по невидимым не попадает вовсе.

**Shadow Shaman · Fowl Play** [interaction] — Shadow Shaman с готовым Fowl Play получает смертельный Culling Blade. Что будет?
- ✔ Умрёт, Fowl Play не сработает  `Fowl Play:note0`
- · Станет курицей с 1 хп, как обычно  `Fowl Play:note0`
- · Станет курицей, но без защиты от урона  `Fowl Play:note0`
- · Станет курицей, но без сильного диспела  `Fowl Play:note0`
- 💬 Смертельный урон от Culling Blade и Reaper's Scythe Fowl Play не предотвращает, так что Шаман просто умирает.

**Troll Warlord · Whirling Axes (Ranged)** [how] — Как работает диспел от Aghanim's Scepter на Whirling Axes?
- ✔ Дальние топоры диспелят врагов, ближние — самого Troll  `Whirling Axes (Ranged):scepter`
- · Дальние и ближние топоры диспелят врагов  `Whirling Axes (Melee):scepter`
- · Дальние топоры диспелят Troll, ближние — врагов  `Whirling Axes (Ranged):scepter`
- · Дальние и ближние топоры диспелят самого Troll  `Whirling Axes (Ranged):scepter`
- 💬 С Аганимом дальние топоры снимают баффы с врагов, а ближние делают базовый диспел самому Troll.

**Sven · Storm Hammer** [how] — Что, кроме дальности и полёта вместе с молотом, добавляет Storm Hammer Aghanim's Scepter?
- ✔ Диспелит цель и задевает даже неуязвимых  `Storm Hammer:scepter`
- · Только диспелит цель  `Storm Hammer:scepter`
- · Диспелит цель и пробивает невосприимчивость к магии  `Storm Hammer:bkbpierce`
- · Задевает неуязвимых и пробивает невосприимчивость к магии  `Storm Hammer:bkbpierce`
- 💬 Аганимный молот делает базовый диспел цели и бьёт неуязвимых, но сквозь невосприимчивость к магии так и не проходит.

**Undying · Soul Rip** [false_fact] — Назовите ложный факт про Soul Rip.
- ✔ Тянет хп из невидимых врагов поблизости  `Soul Rip:note1`
- · Тянет хп из собственных зомби  `Soul Rip:note2`
- · Не тянет хп из юнитов в тумане войны  `Soul Rip:note1`
- · Не может лечить союзные здания, кроме Tombstone  `Soul Rip:note0`
- 💬 Невидимых задевает Decay, а Soul Rip их игнорирует — зато охотно высасывает хп из своих зомби.

**Ursa · Fury Swipes** [interaction] — Что происходит с Fury Swipes, когда на Ursa висит брейк?
- ✔ Новые стаки не вешаются, старые продолжают бить  `Fury Swipes:note1`
- · Все стаки на целях сразу сгорают  `Fury Swipes:note1`
- · Стаки остаются, но не дают урона до конца брейка  `Fury Swipes:note1`
- · Стаки вешаются, но урон от них отключён  `Fury Swipes:note0`
- 💬 Брейк только запрещает накладывать новые стаки — уже набранные продолжают добавлять урон.

**Night Stalker · Hunter in the Night** [how] — Какое ограничение есть у Hunter in the Night с Aghanim's Shard?
- ✔ Днём нельзя съесть древнего крипа  `Hunter in the Night:shard`
- · Древних крипов нельзя есть вообще  `Hunter in the Night:shard`
- · Днём восстанавливает вдвое меньше хп и маны  `none:invented`
- · Днём перезаряжается вдвое дольше  `none:invented`
- 💬 Шардовый Hunter in the Night ест любого крипа, но древних — только ночью.

**Drow Ranger · Multishot** [interaction] — Что получит герой под BKB, попавший под Multishot с включёнными Frost Arrows?
- ✔ Урон стрел, но без слоу и урона Frost Arrows  `Multishot:note0`
- · Ничего, стрелы пролетят сквозь него  `Multishot:note0`
- · Урон стрел и слоу, но без урона Frost Arrows  `Multishot:note1`
- · Урон стрел и урон Frost Arrows, но без слоу  `Multishot:note1`
- 💬 Базовый урон стрел Multishot пробивает невосприимчивость к магии, а урон и слоу Frost Arrows — нет.

**Ogre Magi · Ignite** [whose] — Чья способность при повторном попадании по уже задетой цели прибавляет длительность к оставшейся, а не просто обновляет её?
- ✔ Ignite  `Ignite:note1`
- · Frost Arrows  `Frost Arrows:note0`
- · Burning Spear  `Burning Spear:note0`
- · Entangle  `Entangle:desc`
- 💬 Повторный Ignite (в том числе от мультикаста) докидывает время горения к текущему; Frost Arrows лишь обновляет слоу, а Burning Spear стакает урон.

**Elder Titan · Natural Order** [how] — Как распределяется Natural Order, когда Astral Spirit выпущен?
- ✔ Маг. резист режется вокруг духа, броня — вокруг Titan  `Natural Order:desc`
- · Маг. резист режется вокруг Titan, броня — вокруг духа  `Natural Order:desc`
- · И маг. резист, и броня режутся вокруг духа  `Natural Order:desc`
- · И маг. резист, и броня режутся вокруг обоих  `Natural Order:desc`
- 💬 Снижение брони всегда вокруг самого Titan, а маг. резиста — вокруг духа; без духа обе ауры висят на Titan.

**Huskar · Life Break** [false_fact] — Назовите ложный факт про Life Break.
- ✔ Даже пробивающий стан не прервёт прыжок Huskar  `Life Break:note0`
- · Слоу от Life Break действует на цель под BKB  `Life Break:note1`
- · От Life Break нельзя задоджить  `Life Break:note2`
- · Прыжок оборвётся, если цель резко телепортируется  `Life Break:note0`
- 💬 Во время прыжка Huskar невосприимчив к дебаффам, но если его всё же задизейблят, рывок прерывается.

**Lone Druid · Entangle** [interaction] — Что снимет диспел с врага, на котором висит Entangle?
- ✔ Сам рут, а счётчик стаков останется  `Entangle:note2`
- · Ничего: ни рут, ни стаки не развеиваются  `Entangle:note2`
- · И рут, и счётчик стаков  `Entangle:note1`
- · Счётчик стаков, а рут останется  `Entangle:note1`
- 💬 Дебафф Entangled развеивается, а счётчик стаков на враге и бафф усиления на Lone Druid — нет.

**Primal Beast · Rock Throw** [how] — Как Rock Throw от шарда влияет на Uproar?
- ✔ Даёт по стаку за каждого задетого героя  `Rock Throw:desc`
- · Даёт один стак, сколько бы героев ни задел  `Rock Throw:desc`
- · Никак, стаки идут только от входящего урона  `Rock Throw:desc`
- · Тратит стаки и усиливает стан камня  `none:invented`
- 💬 Rock Throw — исключение из правила «стаки только от входящего урона»: каждый задетый герой добавляет стак Uproar."}],"comment":""}]}

**Slark · Essence Shift** [false_fact] — Назовите ложный факт про Essence Shift.
- ✔ Когда Slark умирает, враги сразу получают украденные статы обратно  `Essence Shift:note1`
- · Чтобы навсегда украсть ловкость, Slark не обязательно добивать героя  `Essence Shift:note2`
- · Под брейком Slark всё равно навсегда крадёт ловкость за убийства  `Essence Shift:note3`
- · Брейк не отнимает бонус от уже набранных стаков  `Essence Shift:note4`
- 💬 Возврат статов у Slark и у врага независимый: смерть Slark обнуляет только его бонус, а враг ходит без статов, пока не спадёт его собственный дебафф.

**Weaver · Geminate Attack** [interaction] — После первой атаки Weaver с Geminate Attack цель успела отойти за радиус атаки. Что будет со второй атакой?
- ✔ Всё равно вылетит и попадёт в цель  `Geminate Attack:note0`
- · Не вылетит, но кд Geminate уйдёт  `Geminate Attack:note0`
- · Не вылетит, и кд не уйдёт  `Geminate Attack:note0`
- · Weaver пойдёт за целью и ударит, когда догонит  `Geminate Attack:note0`
- 💬 Дополнительные атаки Geminate вылетают через 0.25 секунды и не имеют ограничения по дальности.

**Enchantress · Impetus** [how] — В какой момент Impetus измеряет дистанцию до цели?
- ✔ Когда снаряд попадает в цель  `Impetus:note1`
- · Когда Enchantress начинает замах  `Impetus:note1`
- · Когда снаряд вылетает  `Impetus:note1`
- · Берётся большая из дистанций при вылете и при попадании  `Impetus:note1`
- 💬 Дистанция считается при попадании снаряда, так что убегающая от копья цель сама увеличивает себе урон.

**Dark Seer · Ion Shell** [interaction] — Получает ли урон сам юнит, на которого повесили Ion Shell?
- ✔ Нет, никогда  `Ion Shell:note1`
- · Да, всегда  `Ion Shell:note1`
- · Только если это вражеский юнит  `Ion Shell:note1`
- · Только если рядом нет других целей  `Ion Shell:note1`
- 💬 Ion Shell бьёт только юнитов вокруг носителя. Даже повешенный на врага щит не ранит его самого, а жжёт его союзников.

**Kunkka · Admiral's Rum** [how] — Может ли урон, отложенный Admiral's Rum, убить героя, когда ром выветрится?
- ✔ Нет, этот урон не смертелен  `Admiral's Rum:note0`
- · Да, килл засчитают тому, кто нанёс урон  `Admiral's Rum:note0`
- · Да, но килл никому не засчитается  `Admiral's Rum:note0`
- · Только если отложенный урон был чистым  `Admiral's Rum:note0`
- 💬 Урон, пришедший после окончания рома, не смертелен: он никогда не убивает героя.

**Enchantress · Untouchable** [whose] — Чья механика: эффект вешается в момент начала атаки, а не когда урон доходит до цели?
- ✔ Untouchable  `Untouchable:note1`
- · Saltwater Shiv  `Saltwater Shiv:invented`
- · Tidebringer  `Tidebringer:invented`
- · Normal Punch  `Normal Punch:invented`
- 💬 Слоу от Untouchable вешается на атакующего уже в начале замаха, ещё до нанесения урона.

**Templar Assassin · Meld** [false_fact] — Назовите ложный факт про Meld.
- ✔ Meld слетает, если Templar Assassin получает урон  `Meld:note0`
- · Минус броня от Meld не работает на тавер  `Meld:note1`
- · Урон и минус броня от Meld достаются всем, кого задел сплит Psi Blades  `Meld:desc`
- · Канал Psionic Projection не сбивает Meld  `Meld:note0`
- 💬 Meld сбивается только действиями TA: она двигается, атакует или кастует. Входящий урон его не снимает, а вот медитацию Inner Peace прерывает.

**Timbersaw · Reactive Armor** [interaction] — Что делает брейк с Reactive Armor?
- ✔ Новые стаки не набираются, а набранные продолжают работать  `Reactive Armor:note1`
- · Все набранные стаки сразу сгорают  `Reactive Armor:note1`
- · Стаки набираются, но не дают бонусов, пока висит брейк  `Reactive Armor:note0`
- · Стаки замораживаются: не набираются и не спадают  `Reactive Armor:invented`
- 💬 Брейк только мешает набирать новые стаки Reactive Armor. Бонусы от уже набранных остаются и спадают как обычно.

**Dark Willow · Cursed Crown** [how] — Что будет, если развеять Cursed Crown с Aghanim's Shard до конца отсчёта?
- ✔ Стана не будет, но брамблы всё равно вырастут  `Cursed Crown:shard`
- · Ничего не произойдёт: ни стана, ни брамблов  `Cursed Crown:shard`
- · Стан и брамблы сработают сразу, без отсчёта  `Cursed Crown:invented`
- · Стан сработает, а брамблы не вырастут  `Cursed Crown:dispellable`
- 💬 Диспел снимает Cursed Crown вместе со станом, но брамблы от шарда появляются даже после развеивания.

**Death Prophet · Crypt Swarm** [interaction] — Что будет, если кинуть Crypt Swarm в героя с Linken's Sphere?
- ✔ Сфера не сработает, даже если кинуть прямо в него  `Crypt Swarm:note1`
- · Сфера сработает, если кинуть в героя, но не если в точку  `Crypt Swarm:note1`
- · Сфера заблокирует урон по нему, остальные получат урон  `Crypt Swarm:note1`
- · Сфера сработает, и весь рой исчезнет  `Crypt Swarm:note1`
- 💬 Crypt Swarm не триггерит ни Linken's Sphere, ни Lotus Orb, даже если кастовать его прямо в героя.

**Legion Commander · Duel** [how] — Что может досрочно прервать Duel?
- ✔ Если героев растащить слишком далеко друг от друга  `Duel:note0`
- · Если на цель кинуть сильный диспел  `Duel:dispellable`
- · Если цель станет невосприимчива к магии  `Duel:bkbpierce`
- · Если Legion Commander застанят или захексят  `Duel:invented`
- 💬 Duel не развеивается и пробивает невосприимчивость к магии. Досрочно он заканчивается, только если героев растащат на 2000 единиц.

**Venomancer · Poison Sting** [false_fact] — Назовите ложный факт про Venomancer.
- ✔ Урон от Poison Sting сбивает лечение от Salve и Tango  `Poison Sting:note1`
- · Слоу от Venomous Gale слабеет со временем  `Venomous Gale:note2`
- · Дебаффы, разошедшиеся от Noxious Plague, не режутся статус-резистом  `Noxious Plague:note0`
- · Тики Venomous Gale могут добить героя  `Venomous Gale:note0`
- 💬 Poison Sting не сбивает лечение от предметов и даже не уводит Blink Dagger в кд.

**Magnus · Empower** [interaction] — Что получит союзник дальнего боя от Empower?
- ✔ Только бонус к урону  `Empower:note2`
- · Бонус к урону и полный клив  `Empower:note2`
- · Бонус к урону и ослабленный клив  `Empower:note2`
- · Ничего: на ренж-героя Empower не кастуется  `Empower:desc`
- 💬 Empower кастуется на любого союзника, но ренж-юниты не умеют кливать: им достаётся только урон.

**Doom · Lvl ? Pain** [how] — Когда проклятие Lvl ? Pain вешается атаками не только на героев?
- ✔ Когда Doom максимального уровня  `Lvl ? Pain:note0`
- · Когда уровень Doom кратен шести  `Lvl ? Pain:desc`
- · Пока активен Scorched Earth  `none:invented`
- · С Aghanim's Scepter  `Doom:scepter`
- 💬 На максимальном уровне Doom проклинает любой атакой; кратность шести влияет только на силу взрыва — и считается по уровню цели.

**Zeus · Nimbus** [how] — Кого бьёт молнией Nimbus?
- ✔ Ближайшего врага, даже крипа  `Nimbus:note1`
- · Только ближайшего вражеского героя  `Lightning Bolt:desc`
- · Ближайшего видимого врага, герои в приоритете  `Heavenly Jump:desc`
- · Случайного врага в радиусе  `Nimbus:note1`
- 💬 Nimbus бьёт ближайшего вражеского юнита, а не героя: в отличие от Bolt в землю, его можно «отвлечь» крипами.

**Marci · Rebound** [false_fact] — Назовите ложный факт про Marci.
- ✔ Альт-каст Rebound утащит союзника, даже если тот под рутом  `Rebound:note2`
- · От разбега Marci к союзнику можно задоджить  `Rebound:note0`
- · Rebound не отражается спелл-рефлектом  `Rebound:note1`
- · Unleash снимает лимит скорости атаки  `Unleash:note1`
- 💬 Союзника под рутом или на привязи альт-каст Rebound с собой не возьмёт, Marci прыгнет одна.

**Dazzle · Shadow Wave** [how] — Враг стоит рядом с несколькими союзниками, которых задела Shadow Wave. Сколько урона он получит?
- ✔ Урон от каждого союзника рядом  `Shadow Wave:note1`
- · Урон один раз, сколько бы союзников ни было  `Shadow Wave:note1`
- · Урон один раз, но больше за каждого союзника  `Shadow Wave:note1`
- · Урон только от союзных героев, крипы не в счёт  `Shadow Wave:note0`
- 💬 Каждый союзник, задетый Shadow Wave, бьёт врагов вокруг себя отдельно, так что стоящий в толпе враг получает урон несколько раз.

**Pangolier · Rolling Thunder** [how] — Может ли один Rolling Thunder застанить одного и того же врага несколько раз?
- ✔ Да, но только после окончания предыдущего стана  `Rolling Thunder:note0`
- · Нет, только один раз за использование  `Rolling Thunder:note0`
- · Да, и каждое попадание обновляет стан  `Rolling Thunder:note0`
- · Да, но каждый следующий стан короче  `Rolling Thunder:invented`
- 💬 Пока на враге висит стан от Rolling Thunder, шар его не задевает. Как только стан закончится, можно наехать ещё раз.

**Jakiro · Liquid Fire** [false_fact] — Назовите ложный факт про Jakiro.
- ✔ Liquid Fire не работает на зданиях  `Liquid Fire:note0`
- · Dual Breath не триггерит Linken's Sphere  `Dual Breath:note2`
- · Стан от Ice Path снимает только сильный диспел  `Ice Path:dispellable`
- · Атака второй головы игнорирует блок урона  `Double Trouble:note0`
- 💬 На здания не действует Liquid Frost, а Liquid Fire жжёт и юнитов, и здания.

**Riki · Backstab** [interaction] — Что происходит, когда иллюзия Riki бьёт врага в спину?
- ✔ Анимация удара в спину есть, бонусного урона нет  `Backstab:note1`
- · Бьёт с бонусом Backstab, как и сам Riki  `Backstab:note1`
- · Нет ни анимации, ни бонусного урона  `Backstab:note1`
- · Бонус есть, но урезан, как весь урон иллюзии  `Backstab:note1`
- 💬 Иллюзии Riki проигрывают анимацию Backstab, но бонусного урона от ловкости не наносят. Отличить их по цифрам урона можно, по анимации нельзя.

**Meepo · Earthbind** [interaction] — Что Earthbind делает с невидимым врагом, попавшим в сеть?
- ✔ Рутит и показывает его  `Earthbind:note0`
- · Рутит, но он остаётся невидимым  `Earthbind:note0`
- · Показывает, но не рутит  `Earthbind:note0`
- · Ничего, сеть невидимых не задевает  `Earthbind:note0`
- 💬 Earthbind цепляет невидимых врагов и раскрывает их, так что сеть вслепую по подозрительному месту работает.

**Skywrath Mage · Mystic Flare** [interaction] — Что Mystic Flare сделает с иллюзией героя, попавшей в зону?
- ✔ Сразу её уничтожит  `Mystic Flare:note2`
- · Заберёт часть урона у настоящего героя  `Mystic Flare:note2`
- · Проигнорирует её, как крипов  `Mystic Flare:note2`
- · Нанесёт ей урон с множителем, как по иллюзии  `Mystic Flare:invented`
- 💬 

**Pugna · Decrepify** [false_fact] — Назовите ложный факт про способности Pugna.
- ✔ Союзник под Decrepify получает больше маг. урона  `Decrepify:desc`
- · Decrepify можно кинуть на собственный Nether Ward  `Decrepify:note2`
- · Decrepify не замедляет союзников  `Decrepify:note1`
- · Если Nether Ward убьёт кастера, его спелл не сработает  `Nether Ward:note0`
- 💬 Лишний маг. урон получают только враги под Decrepify, а союзникам он усиливает лечение и даже не замедляет их.

**Snapfire · Lil' Shredder** [how] — Как работают атаки Lil' Shredder?
- ✔ Прокают модификаторы атаки, BAT становится 1.0  `Lil' Shredder:note1`
- · Не прокают модификаторы атаки, BAT становится 1.0  `Lil' Shredder:note1`
- · Прокают модификаторы атаки, интервал фиксирован  `Lil' Shredder:note0`
- · Не прокают модификаторы атаки, интервал фиксирован  `Lil' Shredder:note0`
- 💬 Lil' Shredder ставит BAT 1.0, так что скорость атаки по-прежнему важна, а модификаторы атаки на этих выстрелах прокают.

**Beastmaster · Drums of Slom** [how] — Как Primal Roar влияет на Drums of Slom?
- ✔ Засчитывается как 10 атак  `Drums of Slom:desc`
- · Сразу выставляет минимальный интервал барабана  `Drums of Slom:desc`
- · Мгновенно бьёт в барабан один раз  `none:invented`
- · Никак, интервал ускоряют только атаки  `Drums of Slom:desc`
- 💬 Primal Roar засчитывается барабану как 10 атак, то есть это половина пути до минимального интервала, который даёт 20 атак.
- ⚠ проверка: «Мгновенно бьёт в барабан один раз» — unknown, ожидалось false (В данных нет сведений о мгновенном ударе в барабан.)

**Razor · Eye of the Storm** [how] — Какие здания может бить Eye of the Storm с Aghanim's Scepter?
- ✔ Башни, бараки и трон  `Eye of the Storm:scepter`
- · Любые здания в радиусе  `Eye of the Storm:scepter`
- · Только башни и бараки  `Eye of the Storm:scepter`
- · Башни, бараки, трон и шрайны  `Eye of the Storm:scepter`
- 💬 С аганимом Eye of the Storm бьёт только башни, бараки и трон, а филлеры и прочие постройки игнорирует.

**Grimstroke · Phantom's Embrace** [interaction] — От чего фантом Phantom's Embrace отвалится от цели?
- ✔ Цель ушла в инвиз  `Phantom's Embrace:note0`
- · Цель получила сильный диспел  `Phantom's Embrace:dispellable`
- · Цель отошла далеко от Grimstroke  `none:invented`
- · Grimstroke получил стан  `none:invented`
- 💬 Фантом отпадает, только если цель ушла в инвиз или получила невосприимчивость к магии, а диспелом его не снять.

**Chen · Holy Persuasion** [false_fact] — Назовите ложный факт про Holy Persuasion.
- ✔ Если захватить крипа сверх лимита, самый старый крип просто уходит от Chen  `Holy Persuasion:note0`
- · Прокачка Holy Persuasion не поднимает хп уже захваченным крипам  `Holy Persuasion:note2`
- · Захваченный крип сразу получает полную ману  `Holy Persuasion:note3`
- · Своего крипа можно убрать глобально, только если его недавно не били  `Holy Persuasion:desc`
- 💬 Самый старый крип при превышении лимита не освобождается, а умирает. Остальное правда: мана восполняется, хп старых крипов при прокачке не растёт, а отозвать можно только крипа, который недавно не получал урон.

**Phantom Lancer · Illusory Armaments** [whose] — Чья это механика: каждая только что созданная иллюзия героя первые несколько секунд наносит урон не ниже фиксированного порога?
- ✔ Illusory Armaments  `Illusory Armaments:desc`
- · Doppelganger  `Doppelganger:desc`
- · Phantasm  `Phantasm:desc`
- · Chaos Bolt  `Chaos Bolt:shard`
- 💬 Это скрытый иннейт Phantom Lancer — Illusory Armaments: свежие иллюзии первые секунды бьют не слабее фиксированного значения.

**Chaos Knight · Chaos Bolt** [how] — Как связаны длительность стана и урон Chaos Bolt?
- ✔ Чем дольше стан, тем меньше урон  `Chaos Bolt:note0`
- · Чем дольше стан, тем больше урон  `Chaos Bolt:note0`
- · Никак, оба значения роллятся независимо  `Chaos Bolt:note0`
- · Чем дальше цель, тем дольше стан и меньше урон  `Chaos Bolt:invented`
- 💬 Стан и урон Chaos Bolt обратно связаны: длинный стан идёт с малым уроном, короткий — с большим.

**Faceless Void · Time Dilation** [how] — Как меняется количество стаков Time Dilation на враге, пока она висит?
- ✔ Растёт от каста способностей и падает, когда их кд заканчивается  `Time Dilation:note1`
- · Фиксируется в момент каста и дальше не меняется  `Time Dilation:note1`
- · Растёт от каста способностей, но никогда не падает  `Time Dilation:note1`
- · Растёт от каста способностей и предметов, падает с концом кд  `Time Dilation:note0`
- 💬 Стаки живые: каждая способность, ушедшая в кд, добавляет стак, а закончившийся кд его снимает. Предметы Time Dilation не трогает.

**Puck · Puckish** [interaction] — От чьих атак Puckish не восстанавливает хп и ману, даже если Puck их задоджил?
- ✔ От башен  `Puckish:desc`
- · От иллюзий  `Puckish:invented`
- · От крипов  `Puckish:invented`
- · От саммонов  `Puckish:invented`
- 💬 Puckish срабатывает на любой задодженный снаряд атаки, кроме выстрелов башен.

**Juggernaut · Blade Fury** [interaction] — Juggernaut крутится в Blade Fury и бьёт рукой вражеского героя, которого задевает вихрь. Что будет?
- ✔ Атака пройдёт, но урона не нанесёт  `Blade Fury:note1`
- · Атаковать во время Blade Fury нельзя  `Blade Fury:note1`
- · Ударит как обычно, с уроном  `Blade Fury:note1`
- · Ударит, но без крита от Blade Dance  `Blade Fury:note1`
- 💬 Во время Blade Fury атаки по тем, кого задевает вихрь, урона не наносят — бить имеет смысл только варды и здания.

**Spirit Breaker · Greater Bash** [how] — На Spirit Breaker висит брейк. Какой баш от Greater Bash у него остаётся?
- ✔ Баш с Charge of Darkness и с Nether Strike  `Greater Bash:note1`
- · Только баш с Nether Strike  `Greater Bash:note1`
- · Только баш с Charge of Darkness  `Greater Bash:note1`
- · Никакого, баш выключается целиком  `Greater Bash:note1`
- 💬 Брейк отключает только пассивный шанс баша, а баш с Charge of Darkness и Nether Strike срабатывает как обычно.

**Spirit Breaker · Empowering Haste** [whose] — У какой способности длительность бафа ставится на паузу, пока действует другая способность того же героя?
- ✔ Empowering Haste  `Empowering Haste:desc`
- · Bulldoze  `Bulldoze:invented`
- · Fiery Soul  `Fiery Soul:note0`
- · Bladeform  `Bladeform:desc`
- 💬 Пока Spirit Breaker в Charge of Darkness, длительность скорости от Empowering Haste стоит на месте.

**Lina · Fiery Soul** [false_fact] — Назовите ложный факт про Lina.
- ✔ Каждый стак Fiery Soul тикает со своей длительностью  `Fiery Soul:note0`
- · Dragon Slave, кинутый прямо в героя, не сбивает Linken's Sphere  `Dragon Slave:note1`
- · Предметы не дают стаков Fiery Soul  `Fiery Soul:note1`
- · От Laguna Blade можно успеть увернуться уже после каста  `Laguna Blade:note0`
- 💬 Стаки Fiery Soul не живут отдельно: каждое новое попадание спеллом обновляет длительность всех стаков сразу.

**Anti-Mage · Persecutor** [interaction] — Что иллюзии Anti-Mage делают так же сильно, как он сам?
- ✔ Замедляют через Persecutor  `Persecutor:note0`
- · Жгут ману через Mana Break  `Mana Break:note0`
- · Наносят урон от Mana Break  `Mana Break:desc`
- · Ничего, у иллюзий всё урезано  `Persecutor:note0`
- 💬 Иллюзии жгут лишь 25% маны (и урон от Mana Break падает вместе с ней), но слоу от Persecutor дают в полную силу.

**Muerta · Dead Shot** [interaction] — Muerta стреляет Dead Shot во вражеского героя под невосприимчивостью к магии. Что будет?
- ✔ Пуля отрикошетит от него дальше  `Dead Shot:note2`
- · Пуля пропадёт без рикошета  `Dead Shot:note2`
- · Отрикошетит и напугает его тоже  `Dead Shot:bkbpierce`
- · Никак: в такого героя её не скастовать  `Dead Shot:note2`
- 💬 Dead Shot можно отрикошетить от цели с невосприимчивостью к магии, но саму её он не пробивает.

**Enigma · Event Horizon** [how] — На кого рядом с Enigma действует слоу от Event Horizon?
- ✔ На врагов, которые идут от Enigma  `Event Horizon:desc`
- · На врагов, которые идут к Enigma  `Event Horizon:desc`
- · На всех врагов вокруг Enigma  `Event Horizon:desc`
- · На врагов, которых атакуют эйдолоны  `Event Horizon:invented`
- 💬 Event Horizon режет скорость только тем, кто пытается уйти от Enigma, — бежать к нему можно без штрафа.

**Void Spirit · Aether Remnant** [false_fact] — Назовите ложный факт про способности Void Spirit.
- ✔ Притяжение Aether Remnant не снимается диспелом  `Aether Remnant:dispellable`
- · Атаки Astral Step не дают клива  `Astral Step:note0`
- · Щит Resonant Pulse поглощает только физический урон  `Resonant Pulse:desc`
- · Метка Astral Step вешается даже на врагов под BKB  `Astral Step:bkbpierce`
- 💬 Притяжение Aether Remnant развеивается обычным диспелом, а вот Astral Step бьёт сквозь BKB, не кливает, и щит Pulse держит только физику.

**Ring Master · Wheel of Wonder** [how] — Что запускает таймер взрыва Wheel of Wonder?
- ✔ Первый загипнотизированный враг  `Wheel of Wonder:desc`
- · Первый враг, которого колесо задело по пути  `Wheel of Wonder:desc`
- · Остановка колеса в целевой точке  `Wheel of Wonder:desc`
- · Первый урон по врагу в радиусе колеса  `Wheel of Wonder:desc`
- 💬 Таймер взрыва стартует, когда кто-то первым попался под гипноз; если никто не посмотрел на колесо, оно взорвётся само по истечении времени.

**Underlord · Atrophy Aura** [interaction] — Что делает брейк с Atrophy Aura?
- ✔ Выключает ауру и не даёт копить новый бонус урона  `Atrophy Aura:note0`
- · Выключает ауру, но бонус урона продолжает копиться  `Atrophy Aura:note0`
- · Выключает ауру и сбрасывает накопленный бонус урона  `Atrophy Aura:note0`
- · Аура работает, но новый бонус урона не копится  `Atrophy Aura:note0`
- 💬 Брейк отключает и снижение урона врагам, и набор новых стаков, но уже накопленный бонус Underlord не теряет.

**Clinkz · Death Pact** [how] — Что происходит с хп Clinkz, когда заканчивается Death Pact?
- ✔ Макс. хп падает, текущее остаётся прежним  `Death Pact:note2`
- · Макс. и текущее хп падают на величину бонуса  `Death Pact:note2`
- · Макс. хп падает, текущее сохраняет тот же процент  `Death Pact:note2`
- · Макс. хп падает постепенно, текущее тянется за ним  `Death Pact:invented`
- 💬 По окончании Death Pact уходит только бонус к максимуму — текущее хп не отнимается, так что съеденный крип остаётся честным хилом.

**Bristleback · Warpath** [how] — Что делает брейк с Warpath?
- ✔ Новые стаки не копятся, а старые продолжают работать  `Warpath:note2`
- · Бонусы отключаются, но стаки продолжают копиться  `Warpath:note3`
- · Сбрасывает все стаки разом  `Warpath:note3`
- · Ничего, Warpath брейком не отключается  `Warpath:note2`
- 💬 Брейк только мешает набирать новые стаки Warpath, а уже накопленные бонусы остаются до конца своей длительности.

**Luna · Eclipse** [false_fact] — Назовите ложный факт про Eclipse.
- ✔ С Aghanim's Scepter лимит лучей на одну цель остаётся  `Eclipse:scepter`
- · Без очков в Lucent Beam Eclipse не работает  `Eclipse:note0`
- · Лучи прекращаются, если Luna умирает  `Eclipse:note1`
- · Лучи не бьют по невидимым врагам  `Eclipse:note2`
- 💬 Аганим снимает лимит лучей на одну цель, так что одиночку под Eclipse можно забить лучами целиком.

**Alchemist · Unstable Concoction** [interaction] — Цель сделала Manta Style, пока в неё летела Unstable Concoction. Что будет?
- ✔ Банка всё равно долетит и взорвётся на цели  `Unstable Concoction:note3`
- · Банка пропадёт, как любой задоженный снаряд  `Unstable Concoction:note3`
- · Банка взорвётся там, где цель была в момент Manta  `none:invented`
- · Банка пропадёт, а Alchemist получит стан от неё  `Unstable Concoction:desc`
- 💬 Unstable Concoction нельзя задоджить: ни Manta, ни блинк не сбивают уже брошенную банку.

**Tiny · Toss** [interaction] — Как Toss работает с врагами под невосприимчивостью к дебаффам?
- ✔ Целиться в них можно, а подкинуть нельзя  `Toss:note2`
- · Нельзя ни целиться в них, ни подкинуть  `Toss:note2`
- · Подкинуть можно, а целиться в них нельзя  `Toss:note2`
- · Можно и то и другое, но урона они не получат  `Toss:note2`
- 💬 Героя под невосприимчивостью к дебаффам можно выбрать целью Toss и закидать крипами, но самого его Tiny не поднимет.

**Crystal Maiden · Crystal Clone** [how] — Кто ещё, кроме урона врагов и таймера, может разбить Crystal Clone?
- ✔ Сама Crystal Maiden своими спеллами  `Crystal Clone:desc`
- · Сама Crystal Maiden атакой, как денай  `Crystal Clone:desc`
- · Союзники атакой, как денай  `none:invented`
- · Никто, только урон врагов или таймер  `Crystal Clone:desc`
- 💬 Клона можно разбить своим же спеллом, например кинуть в него Crystal Nova: так CM сразу взрывает его и накладывает Frostbite по области.
- ⚠ проверка: «Сама Crystal Maiden атакой, как денай» — unknown, ожидалось false (В данных упомянуты только спеллы самой Crystal Maiden, про денай атакой ничего не сказано.)
- ⚠ проверка: «Союзники атакой, как денай» — unknown, ожидалось false (Про денай клона союзниками в данных ничего не сказано.)

**Wraith King · Reincarnation** [how] — У Wraith King есть Aegis, и Reincarnation не на кд. Что произойдёт, когда его убьют?
- ✔ Сработает Reincarnation, Aegis останется  `Reincarnation:note1`
- · Сработает Aegis, ульта останется без кд  `Reincarnation:note1`
- · Сработает Reincarnation, но Aegis всё равно сгорит  `Reincarnation:note1`
- · Сработает Aegis, а ульта всё равно уйдёт в кд  `Reincarnation:note1`
- 💬 Reincarnation срабатывает раньше Aegis, так что Aegis остаётся на вторую смерть.

**Bane · Ichor of Nyctasha** [how] — Что делает Terror, который враг получает от Ichor of Nyctasha?
- ✔ Снижает статус-резист к дебаффам Bane до конца игры  `Ichor of Nyctasha:desc`
- · Снижает статус-резист к дебаффам Bane до его следующей смерти  `Ichor of Nyctasha:desc`
- · Снижает статус-резист ко всем дебаффам до конца игры  `Ichor of Nyctasha:desc`
- · Усиливает чистый урон Bane по нему до конца игры  `Ichor of Nyctasha:desc`
- 💬 Terror остаётся до конца игры и снижает статус-резист только к дебаффам самого Bane.

**Ember Spirit · Searing Chains** [interaction] — Враг в инвизе стоит рядом с Ember Spirit, когда тот кастует Searing Chains. Что будет?
- ✔ Цепи его проигнорируют  `Searing Chains:note1`
- · Цепи зацепят его, но инвиз не спадёт  `Searing Chains:note1`
- · Цепи зацепят его, только если рядом нет видимых целей  `Searing Chains:note1`
- · Цепи зацепят его и выбьют из инвиза  `Searing Chains:note1`
- 💬 Searing Chains выбирают цели случайно, но невидимых и невосприимчивых к дебаффам юнитов пропускают полностью.

**Necrophos · Reaper's Scythe** [false_fact] — Назовите ложный факт про способности Necrophos.
- ✔ Reaper's Scythe наносит урон сразу, а потом держит стан  `Reaper's Scythe:note0`
- · Урон от Heartstopper Aura не сбивает Blink Dagger  `Heartstopper Aura:note0`
- · От Death Pulse нельзя уйти диcджойнтом  `Death Pulse:note0`
- · Death Seeker не отражается Lotus Orb  `Death Seeker:note0`
- 💬 Урон Reaper's Scythe наносится в конце стана, поэтому за время стана врага ещё можно добить или подлечить.

**Slardar · Guardian Sprint** [interaction] — Slardar телепортируется по TP и во время канала нажимает Guardian Sprint. Что произойдёт?
- ✔ Спринт включится, TP продолжится  `Guardian Sprint:note0`
- · Спринт включится, TP прервётся  `Guardian Sprint:note0`
- · Спринт не нажмётся, пока идёт TP  `Guardian Sprint:note0`
- · Спринт встанет в очередь и включится после TP  `Guardian Sprint:note0`
- 💬 Guardian Sprint не прерывает каналы, поэтому его можно прожать прямо во время TP и прилететь уже ускоренным.

**Hoodwink · Bushwhack** [how] — Что будет, если срубить дерево, к которому Bushwhack притянул врага?
- ✔ Стан сразу закончится  `Bushwhack:note0`
- · Его притянет к другому ближайшему дереву в зоне  `Bushwhack:note0`
- · Ничего, стан продержится до конца и без дерева  `Bushwhack:note0`
- · Стан сменится рутом до конца длительности  `Bushwhack:invented`
- 💬 Bushwhack держится на дереве: срубишь его, и цель сразу выйдет из стана.

**Shadow Fiend · Requiem of Souls** [how] — Чего не накладывает Requiem of Souls, который выпустился при смерти Shadow Fiend?
- ✔ Страха и замедления  `Requiem of Souls:note1`
- · Только страха  `Requiem of Souls:note1`
- · Страха, замедления и снижения маг. резиста  `Requiem of Souls:note1`
- · Накладывает всё, как при обычном касте  `Requiem of Souls:note1`
- 💬 Посмертный Requiem наносит урон, но без страха и замедления.

**Queen of Pain · Scream Of Pain** [false_fact] — Назовите ложный факт про Scream Of Pain.
- ✔ Отражается 25% урона, который прошёл уже после маг. резиста цели  `Scream Of Pain:note2`
- · Урон по иллюзиям не отражается в QoP  `Scream Of Pain:note2`
- · Отражённый урон не может убить QoP  `Scream Of Pain:note2`
- · От его снарядов нельзя увернуться дизджойнтом  `Scream Of Pain:note1`
- 💬 Отражённый урон считается до снижения, не может убить QoP и не возвращается от иллюзий.

**Treant Protector · Overgrowth** [interaction] — Враг попал под Overgrowth и уже после этого выпил BKB. Что будет?
- ✔ Он освободится  `Overgrowth:note0`
- · Останется в корнях до конца, ульта ведь пробивает BKB  `Overgrowth:note0`
- · Останется в корнях, но перестанет получать урон  `Overgrowth:note0`
- · Сможет атаковать, но не двигаться  `Overgrowth:note0`
- 💬 Overgrowth ловит тех, у кого BKB уже был, но если невосприимчивость появилась после начала, цель вырвется.

**Dragon Knight · Breathe Fire** [interaction] — Dragon Knight кастует Breathe Fire прямо в героя с Linken's Sphere. Что будет?
- ✔ Огонь пройдёт, Linken's не уйдёт в кд  `Breathe Fire:note0`
- · Linken's поглотит каст, огонь не выйдет  `Breathe Fire:note0`
- · Linken's сработает, но конус заденет остальных  `Breathe Fire:note0`
- · Огонь пройдёт, но Linken's всё равно уйдёт в кд  `Breathe Fire:note0`
- 💬 Breathe Fire не триггерит ни блок, ни отражение заклинаний, даже если кастовать его в героя.

**Leshrac · Diabolic Edict** [how] — Что будет с Diabolic Edict, если Leshrac умрёт посреди действия?
- ✔ Взрывы продолжатся до конца  `Diabolic Edict:note0`
- · Взрывы сразу прекратятся  `Diabolic Edict:note0`
- · Взрывы продолжатся, но без урона по зданиям  `Diabolic Edict:invented`
- · Оставшиеся взрывы сработают разом  `Spirits:invented`
- 💬 Взрывы Diabolic Edict доигрывают до конца даже после смерти Leshrac.

**Phantom Assassin · Stifling Dagger** [false_fact] — Назовите ложный факт про Phantom Assassin.
- ✔ Шансовые эффекты предметов от Stifling Dagger срабатывают всегда  `Stifling Dagger:note0`
- · Обычная атака по Рошану снимает Blur  `Blur:note0`
- · Врага под невосприимчивостью к магии Stifling Dagger не замедлит  `Stifling Dagger:note1`
- · Stifling Dagger с повышенным шансом даёт Deadly Focus  `Coup de Grace:desc`
- 💬 Шансовые эффекты срабатывают от Stifling Dagger с тем же шансом, что и от атаки, — гарантии нет.

**Dawnbreaker · Solar Guardian** [how] — Что будет с брошенным Celestial Hammer, если Dawnbreaker начнёт Solar Guardian?
- ✔ Молот мгновенно вернётся к Dawnbreaker  `Solar Guardian:note2`
- · Молот долетит и вернётся сам, как обычно  `Solar Guardian:note2`
- · Dawnbreaker притянется к молоту, как при Converge  `Celestial Hammer:desc`
- · Молот зависнет в точке до конца ульты  `Celestial Hammer:invented`
- 💬 Каст Solar Guardian мгновенно возвращает молот в руки Dawnbreaker.

**Naga Siren · Song of the Siren** [how] — Что будет с усыплённым врагом, если Naga Siren отойдёт от него далеко во время Song of the Siren?
- ✔ Он проснётся  `Song of the Siren:note1`
- · Будет спать до конца песни  `Song of the Siren:note1`
- · Песня досрочно закончится у всех  `Song of the Siren End:invented`
- · Будет спать, но станет уязвимым  `Song of the Siren:note0`
- 💬 Область песни следует за Naga: кто окажется вне радиуса, проснётся.

**Io · Relocate** [interaction] — Что будет, если Io застанят во время задержки перед Relocate?
- ✔ Relocate отменится  `Relocate:note1`
- · Телепорт всё равно сработает  `Relocate:note1`
- · Телепорт сработает, когда стан кончится  `Relocate:invented`
- · Улетит только союзник по Tether  `Relocate:invented`
- 💬 Любой дизейбл на Io во время задержки отменяет Relocate.

**Sand King · Burrowstrike** [interaction] — Что будет, если Burrowstrike проедет через врага с готовой Linken's Sphere?
- ✔ Застанит, а Linken останется целой  `Burrowstrike:note0`
- · Linken поглотит Burrowstrike целиком  `Burrowstrike:note0`
- · Застанит, но Linken уйдёт в кд  `Burrowstrike:note0`
- · Linken снимет только стан, урон пройдёт  `Burrowstrike:note0`
- 💬 Burrowstrike не вызывает ни блок, ни отражение заклинаний: Linken просто не реагирует и не тратится.

**Visage · Gravekeeper's Cloak** [how] — Что делает брейк с Gravekeeper's Cloak?
- ✔ Новые слои не копятся, но текущие продолжают защищать  `Gravekeeper's Cloak:note2`
- · Защита отключается целиком, пока висит брейк  `Gravekeeper's Cloak:note3`
- · Слои продолжают копиться, но защита не работает  `Gravekeeper's Cloak:note3`
- · Перестают защищаться только фамильяры, сам Visage — нет  `Gravekeeper's Cloak:invented`
- 💬 Брейк только останавливает восстановление слоёв, а уже накопленные слои продолжают резать урон.

**Pudge · Meat Hook** [false_fact] — Назовите ложный факт про Meat Hook.
- ✔ Хук, притащивший руну, сбрасывает себе кд  `Meat Hook:note4`
- · Хук пролетает сквозь здания  `Meat Hook:note2`
- · Хук пролетает сквозь древних крипов и Рошана  `Meat Hook:note2`
- · Хук цепляет невидимых даже без просвета  `Meat Hook:note1`
- 💬 Руна, пойманная хуком, возвращает только ману за хук, а кд остаётся.

**Sniper · Assassinate** [how] — Кто видит прицел Assassinate над целью?
- ✔ Только союзники Sniper  `Assassinate:note0`
- · Все, включая саму цель  `Assassinate:note0`
- · Союзники Sniper и сама цель  `Assassinate:note0`
- · Только сам Sniper  `Assassinate:note0`
- 💬 Прицел Assassinate видят только союзники Sniper: цель о выстреле не предупреждают.

**Clockwerk · Battery Assault** [interaction] — Что будет с Battery Assault, если Clockwerk застанят посреди действия?
- ✔ Продолжит бить как ни в чём не бывало  `Battery Assault:note0`
- · Прервётся, остаток длительности сгорит  `Battery Assault:note0`
- · Встанет на паузу и доработает после стана  `Battery Assault:note0`
- · Продолжит бить, но уже без мини-стана  `Battery Assault:invented`
- 💬 Battery Assault остаётся активной, даже если Clockwerk под контролем: шрапнель продолжает мини-станить врагов.

**Viper · Corrosive Skin** [interaction] — Viper под брейком. Что будет с Corrosive Skin?
- ✔ От ударов по Viper не вешается, от Nosedive — вешается  `Corrosive Skin:note1`
- · Не вешается ни от ударов, ни от Nosedive  `Corrosive Skin:note1`
- · От ударов вешается, а Nosedive её больше не накладывает  `Corrosive Skin:note1`
- · Вешается как обычно, пропадает только бонусный маг. резист  `Corrosive Skin:note1`
- 💬 Брейк мешает Corrosive Skin накладываться от урона по Viper, но Nosedive продолжает обливать врагов её эффектом.

**Viper · Poison Attack** [false_fact] — Назовите ложный факт про Viper.
- ✔ Poison Attack не действует на здания даже с Aghanim's Shard  `Poison Attack:shard`
- · Viper Strike вешается сквозь BKB  `Viper Strike:bkbpierce`
- · Viper Strike нельзя снять даже сильным диспелом  `Viper Strike:dispellable`
- · Два Nethertoxin в одной точке не складываются  `Nethertoxin:note0`
- 💬 С шардом Poison Attack бьёт и по зданиям (с уменьшенным уроном), а ещё режет броню за каждый стак.

**Medusa · Stone Gaze** [how] — Враг впервые попал под Stone Gaze за мгновение до конца ульты Medusa. Сколько на нём провисит дебафф?
- ✔ Полную длительность, как и на остальных  `Stone Gaze:note0`
- · Только до конца ульты Medusa  `Stone Gaze:note0`
- · Пока не отвернётся от Medusa  `Stone Gaze:invented`
- · Остаток ульты, но не меньше секунды  `Stone Gaze:note0`
- 💬 Неважно, когда враг получил дебафф Stone Gaze, — он всегда висит полную длительность, даже если ульта уже закончилась.

**Medusa · Mana Shield** [how] — Как броня Medusa влияет на то, сколько маны съедает Mana Shield от физического урона?
- ✔ Никак: щит поглощает урон до брони  `Mana Shield:note0`
- · Чем больше брони, тем меньше уходит маны  `Mana Shield:note0`
- · Броня учитывается, но только против атак героев  `Mana Shield:note0`
- · Броня учитывается, а маг. резист против магии — нет  `Mana Shield:note0`
- 💬 Mana Shield съедает урон раньше любых снижений, поэтому броня не уменьшает расход маны — фарм брони на Medusa не экономит щит.
