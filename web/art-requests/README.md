# Листы частей для врагов Remake

**Готово:** Буйный, Влад Борщ, Повар — вырезаны вручную (исходники в `web/art-src/`), подключены скриптом:

```bash
python web/scripts/import_cut_parts.py <папка с png> <id>
```

Он принимает отдельные PNG-слои (имена с head / body / hand|leg + left|right + top|bottom), выпрямляет конечности, приводит к общему масштабу и пишет раскладку костей в `src/remake/game/enemies/layouts/<id>.json`. Ниже — как делать листы 5×2 для новых персонажей, если удобнее генерировать сразу листом.

## Как сделать

1. Сгенерировать лист по запросу ниже. Образец раскладки — `refs/example_nikita_sheet.png`, лицо — `refs/<персонаж>_head.png`, вся фигура из оригинала — `refs/<персонаж>_full.png` (дать генератору как референс).
2. Положить лист сюда же, например `web/art-requests/povar_sheet.png`.
3. Нарезать:

   ```bash
   python web/scripts/slice_parts_sheet.py web/art-requests/povar_sheet.png povar --preview
   ```

   Части лягут в `web/public/remake/assets/enemies/<id>/parts/`, грубая сборка — в `preview.png`.
4. Дальше скажи мне — я подключу скин, посажу на кости и подгоню опорные точки (редактор «Кости»).

## Общие требования к листу (для всех)

- **16:9, ~1280×720, чёрный фон**, сетка 5×2 с тонкими рамками, подпись части в левом верхнем углу ячейки (как в образце).
- Порядок ячеек:
  - ряд 1: `head` · `torso` · `arm_r_u` · `arm_r_l` · `arm_l_u`
  - ряд 2: `arm_l_l` · `leg_r_u` · `leg_r_l` · `leg_l_u` · `leg_l_l`
- Каждая часть **отдельно**, целиком внутри ячейки, ничего не касается рамки.
- `head` — только голова с шеей, подбородок внизу. `torso` — **без головы**, шея сверху, пояс снизу.
- Верхние части рук/ног (`*_u`) — плечо/бедро сверху; нижние (`*_l`) — локоть/колено сверху, кисть/ступня снизу. Руки и ноги вертикально, вид сбоку-спереди, фотореализм как у Никиты.
- Одинаковый свет и масштаб во всех ячейках.

## Запросы

### Буйный (`buiniy`)

> Character parts sheet for a 2D cutout game rig, photorealistic, black background, 5×2 grid with thin grey frames and small labels (head, torso, arm_r_u, arm_r_l, arm_l_u / arm_l_l, leg_r_u, leg_r_l, leg_l_u, leg_l_l), every body part separate and fully inside its cell. Character: thin Russian man about 35, short dark hair, wide crazy bulging eyes, open mouth yelling (use the reference face), wearing a grey zip-up track jacket with white stripes on the sleeves, light-grey/white baggy tracksuit pants, white sneakers. Torso without head, neck at top. Limbs vertical, upper parts with shoulder/hip at the top, lower parts with hand/foot at the bottom. Same lighting and scale for all parts.

Референс: `refs/buiniy_head.png`, `refs/buiniy_full.png`.

### Влад Борщ (`boss1`, босс 1)

> Character parts sheet for a 2D cutout game rig, photorealistic, black background, 5×2 grid with thin grey frames and small labels (head, torso, arm_r_u, arm_r_l, arm_l_u / arm_l_l, leg_r_u, leg_r_l, leg_l_u, leg_l_l), every body part separate and fully inside its cell. Character: young man with messy brown hair, face covered by a black protective face mask with rows of small holes (use the reference), black hoodie with a small white print on the chest, blue jeans, brown boots. Slightly bulky, boss proportions. Torso without head, neck at top. Limbs vertical, upper parts with shoulder/hip at the top, lower parts with hand/foot at the bottom. Same lighting and scale for all parts.

Референс: `refs/vlad_borsch_head.png`, `refs/vlad_borsch_full.png`.

### Повар (`povar`, босс 2)

> Character parts sheet for a 2D cutout game rig, photorealistic, black background, 5×2 grid with thin grey frames and small labels (head, torso, arm_r_u, arm_r_l, arm_l_u / arm_l_l, leg_r_u, leg_r_l, leg_l_u, leg_l_l), every body part separate and fully inside its cell. Character: very fat teenage boy, round chubby face with a dreamy upward look and slightly open mouth (use the reference face), short brown hair, teal sweater with purple and white horizontal stripes across the chest, black baggy trousers, white-and-teal sneakers. Big round belly in the torso part. Torso without head, neck at top. Thick limbs vertical, upper parts with shoulder/hip at the top, lower parts with hand/foot at the bottom. Same lighting and scale for all parts.

Референс: `refs/povar_head.png`, `refs/povar_full.png`.

### По желанию: свои лица для новых типов

Шустрый, Метатель и Блокер сейчас — перекрашенные Никита и Буйный. Если хочешь им свои лица — такой же лист с описанием персонажа, id `runner` / `thrower` / `blocker`.
