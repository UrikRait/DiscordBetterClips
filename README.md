# BetterClips

A [Vencord](https://vencord.dev) user plugin that makes **Discord Clips** usable for real editing.

Discord records clips at a fixed ~15 Mbps (at 1440p60), no matter how good your PC is, and saves them as
`Apex_Legends_6baafbb1-52b5-4cfd-8350-66bd5672126d.mp4` dumped into one folder. BetterClips fixes both.

## Features

- **Higher clip bitrate.** Lifts Discord's hidden 100% cap on `clipsQuality.bitratePercent`.
  - The JS media engine clamps it with `Math.min(100, …)`; this plugin removes the clamp.
  - 400% ≈ 60 Mbps at 1440p60, and the gain is real data (no filler NAL units).
- **Per window / per screen, set right where you pick it.** Every tile in the Go Live source picker gets a `clips N% · X Mbps` dropdown, remembered per window ("Apex Legends") or per screen ("Screen · Экран 1").
  - The gear menu next to **Go Live** has the same option for the selected source.
- **Applied automatically.**
  - When you start streaming, the percent of the streamed source is used.
  - Without a stream, the running game's percent is used.
  - Changes apply live, no restart needed.
- **Tidy files.** Clips are saved as `Apex Legends/Apex Legends_2026-10-23_07-15-42.mp4`; screens go under `Рабочий стол/Экран 1/`.
  - The Discord clips gallery also reads all subfolders, so clips you sort into folders by hand stay visible.
- Default for unset sources: 100% (Discord stock).

## Install (user plugin)

Vencord has no store for third-party plugins, so it's built from source:

```sh
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install --frozen-lockfile
# put this repo's betterClips folder into src/userplugins/
git clone https://github.com/UrikRait/DiscordBetterClips ../DiscordBetterClips
cp -r ../DiscordBetterClips/betterClips src/userplugins/
pnpm build
pnpm inject --branch stable      # Discord must be fully closed
```

Then restart Discord and enable **Settings → Vencord → Plugins → BetterClips**.

## Notes

- Measured: 100% ≈ 15 Mbps, 400% ≈ 60 Mbps at 1440p60. It scales linearly; a 2-minute clip at 400% is about 900 MB.
- Discord's clip encoder is VBR held close to the target (NVENC with `nvRelaxRc`) with a keyframe every second. Constant-quality modes (CQ/CQP) are compiled into `discord_voice.node` and can't be changed from JS.
- Discord has one clips bitrate at a time: during a stream, the streamed source's percent applies to every clip.
- After big Discord updates, a patch may stop matching. Check the Vencord console for `BetterClips` patch errors.
- Client mods are against Discord's Terms of Service. Use at your own risk.

---

## По-русски

Плагин для Vencord, который делает клипы Discord пригодными для монтажа:

- **Битрейт клипов выше стандартного.** Discord прячет ограничение в 100% (~15 Мбит/с при 1440p). Плагин его снимает: 400% ≈ 60 Мбит/с.
- **Свой процент для каждого окна и экрана.** Выпадающий список стоит прямо под каждой плиткой в окне «Демонстрировать экран», и тот же выбор есть в шестерёнке у кнопки «Стримить».
- **Нормальные имена и папки:** `Apex Legends/Apex Legends_2026-10-23_07-15-42.mp4`, экраны лежат в `Рабочий стол/Экран 1/`. Галерея Discord видит и подпапки.

Установка описана выше в разделе «Install». Клиентские моды нарушают правила Discord, используй на свой риск.

## License

GPL-3.0-or-later, like Vencord.
