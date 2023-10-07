// console.log("Hello via Bun!");

import colors from "ansi-colors";
import enquirer from "enquirer";
import figures from "figures";
import fs from "node:fs";
import Miniget from "miniget";
import { Innertube } from "youtubei.js/web";
import ProgressBar from "progress";
import sanitize from "sanitize-filename";

const CHANNEL_ID = "UCUZ1Jxh8roXc1JJh4PXBF7w";
const LOCALE = "en-US-u-co-bn";

const main = async () => {
  const yt = await Innertube.create();
  const channel = await yt.getChannel(CHANNEL_ID);
  const playlists = (await channel.getPlaylists()).playlists
    .filter(
      (v, i, a) =>
        i ===
        a.findIndex(
          (v2) =>
            v2.title.text?.localeCompare(v.title.text as string, LOCALE) === 0,
        ),
    )
    .map((v) => {
      v.video_count_short.text =
        v.video_count_short.text ??
        // @ts-ignore
        (/\d+/g.exec(v.video_count.text as string)[0] as string);
      return v;
    });

  const choices = playlists.map((v) => ({
    name: v.title.text as string,
  }));

  const answer: Record<string, string[]> = await enquirer.prompt({
    choices: choices,
    // @ts-ignore
    footer() {
      return colors.dim("(Scroll up and down to reveal more choices)");
    },
    // @ts-ignore
    limit: 10,
    message: "Select one or more playlist(s)",
    multiple: true,
    name: "0",
    sort: true,
    // @ts-ignore
    symbols: {
      indicator: {
        on: colors.green(figures.circleFilled),
        off: colors.green(figures.circle),
      },
    },
    type: "autocomplete",
  });

  const selectedPlaylists = playlists.filter((v) =>
    answer[0].some(
      (v2) => v2.localeCompare(v.title.text as string, LOCALE) === 0,
    ),
  );

  const totalVideoCount = selectedPlaylists
    .map((v) => Number(v.video_count_short.text as string))
    .reduce((a, b) => a + b, 0);

  for (let i = 0; i < selectedPlaylists.length; i++) {
    const videos = (await yt.getPlaylist(selectedPlaylists[i].id)).videos;
    console.log("Downloading: %s", selectedPlaylists[i].title.text);
    const bar = new ProgressBar(
      "     :bar :percent :currVideos/:totVideos lectures eta :etas",
      {
        total: videos.length,
        clear: false,
        width: 100,
        complete: colors.green("━"),
        incomplete: colors.white("━"),
      },
    );
    const folderName = sanitize(selectedPlaylists[i].title.text as string);
    try {
      await fs.promises.mkdir(folderName);
    } finally {
      for (let j = 0; j < videos.length; j++) {
        const videoDescParts = (
          await yt.getBasicInfo((videos[j] as any).id as string)
        ).basic_info.short_description?.split("\n");
        if (videoDescParts) {
          let pdfUrl: string = "";
          const pdfIndex = videoDescParts.findIndex((part) =>
            part.includes("PDF"),
          );
          if (pdfIndex !== -1 && pdfIndex < videoDescParts.length - 1) {
            const urlParts = videoDescParts[pdfIndex + 1].split("/");
            const id = urlParts[urlParts.length - 2];
            pdfUrl = `https://drive.google.com/uc?id=${id}&export=download`;
            const writer = fs.createWriteStream(`./${folderName}/${j + 1}.pdf`);
            await Miniget(pdfUrl).pipe(writer);
          }
          bar.tick({ currVideos: j + 1, totVideos: videos.length });
        }
      }
    }
  }
};

await main();
