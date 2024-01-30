// console.log("Hello via Bun!");

import colors from "ansi-colors";
import enquirer from "enquirer";
import figures from "figures";
import fs from "node:fs";
import { Innertube } from "youtubei.js/web";
import ProgressBar from "progress";
import { promisify } from "node:util";
import sanitize from "sanitize-filename";
import stream from "node:stream";
import axios from "axios";
import ora from "ora";

const CHANNEL_ID = "UCUZ1Jxh8roXc1JJh4PXBF7w";
const LOCALE = "en-US-u-co-bn";

const pipeline = promisify(stream.pipeline);

/*const mergePdf = async(inputs: string[], output: string) => {
  // use pdf-lib to merge pdfs together
  import { PDFDocument } from 'pdf-lib';

  const mergePdf = async (inputs: string[], output: string) => {
    const mergedPdf = await PDFDocument.create();

    for (const input of inputs) {
      const pdfBytes = await fetchPdfBytes(input);
      const pdf = await PDFDocument.load(pdfBytes);

      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfBytes = await mergedPdf.save();

    // Save the merged PDF to the specified output file
    await savePdfBytes(output, mergedPdfBytes);
  };

  const fetchPdfBytes = async (url: string) => {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return response.data;
  };

  const savePdfBytes = async (path: string, pdfBytes: Uint8Array) => {
    await fs.promises.writeFile(path, pdfBytes);
  };
}*/

const main = async () => {
	const spinner = ora("Intitializing...").start();

	const yt = await Innertube.create();
	const channel = await yt.getChannel(CHANNEL_ID);

	spinner.color = "green";
	spinner.text = "Fetching playlists...";

	const playlists: any[] = [];
	const playlistTab = await channel.getPlaylists();
	let page = playlistTab.has_continuation ? playlistTab : null;

	playlists.push(...playlistTab.playlists);
	while (page && page.has_continuation) {
		page = (await page.getContinuation()) as any;
		// @ts-ignore
		playlists.push(...page.playlists);
	}

	const playlistChoices = playlists
		.filter(
			(v, i, a) =>
				i ===
				a.findIndex(
					(v2) =>
						v2.title.text?.localeCompare(v.title.text as string, LOCALE) === 0
				)
		)
		.map((v) => ({
			name: v.title.text as string,
		}));

	spinner.stop()

	const playlistAnswers: Record<string, string[]> = await enquirer.prompt({
		choices: playlistChoices,
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
		playlistAnswers[0].some(
			(v2) => v2.localeCompare(v.title.text as string, LOCALE) === 0
		)
	);

	for (let i = 0; i < selectedPlaylists.length; i++) {
		const videos: any[] = [];
		const videosTab = await yt.getPlaylist(selectedPlaylists[i].id);
		videos.push(...videosTab.videos);
		let page = videosTab.has_continuation ? videosTab : null;

		while (page && page.has_continuation) {
			page = (await page.getContinuation()) as any;
			// @ts-ignore
			videos.push(...page.videos);
		}

		const videoChoices = videos
			.filter(
				(v, i, a) =>
					i ===
					a.findIndex(
						(v2) =>
							v2.title.text?.localeCompare(v.title.text as string, LOCALE) === 0
					)
			)
			.map((v, n) => ({
				name: v.title.text,
				value: n,
			}));

		const videoAnswers: Record<string, string[]> = await enquirer.prompt({
			choices: videoChoices,
			// @ts-ignore
			footer() {
				return colors.dim("(Scroll up and down to reveal more choices)");
			},
			// @ts-ignore
			limit: 10,
			message: `Select one or more lecture(s) for ${selectedPlaylists[i].title.text}:`,
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
			type: "multiselect",
		});

		const selectedVideos = videoChoices
			.filter((v) =>
				videoAnswers[0].some(
					(v2) => v2.localeCompare(v.name as string, LOCALE) === 0
				)
			)
			.map((v) => v.value);

		if (selectedVideos.length === 0) {
			console.log(
				colors.yellow(`Skipping playlist ${selectedPlaylists[i].title.text}`)
			);
			continue;
		}

		console.log("Downloading: %s", selectedPlaylists[i].title.text);

		const bar = new ProgressBar(
			"     :bar :percent :currVideos/:totVideos lectures eta :etas",
			{
				total: selectedVideos.length,
				clear: true,
				width: 100,
				complete: colors.green("━"),
				incomplete: colors.red("━"),
			}
		);

		const folderName = sanitize(selectedPlaylists[i].title.text as string);

		if (!fs.existsSync(folderName)) await fs.promises.mkdir(folderName);

		for (let j = 0, k = 1; j < videos.length; j++) {
			if (!selectedVideos.includes(j)) continue;

			const videoDescParts = (
				await yt.getBasicInfo((videos[j] as any).id as string)
			).basic_info.short_description?.split("\n");

			if (videoDescParts) {
				let pdfUrl: string = "";
				const pdfIndex = videoDescParts.findIndex((part) =>
					part.includes("PDF")
				);
				// currently issues are in organic chemistry pdf downlaoding as the list there is too big
				// to download and end up in a rate-limitigng forbidden 403 issue whether I use 3 second extra or not

				if (pdfIndex !== -1 && pdfIndex < videoDescParts.length - 1) {
					const urlParts = videoDescParts[pdfIndex + 1].split("/");
					const id = urlParts[urlParts.length - 2];
					pdfUrl = `https://drive.google.com/uc?id=${id}&export=download`;
					const fileName = `./${folderName}/${j + 1}.pdf`;
					const writer = fs.createWriteStream(fileName);
					const reader = await axios.get(pdfUrl, { responseType: "stream" });
					writer.on("finish", () => {
						writer.close();
					});
					writer.on("error", (err) => {
						fs.unlink(fileName, (err) => console.error(err));
						console.error(err);
					});
					reader.data.on("data", (chunk: any) =>
						bar.tick(chunk.length / Number(reader.headers["content-length"]), {
							currVideos: k,
							totVideos: selectedVideos.length,
						})
					);
					reader.data.on("error", (err: any) => {
						fs.unlink(fileName, (err) => console.error(err));
						console.error(err);
					});
					await pipeline(reader.data, writer)
						.then(() => reader.data?.destroy())
						.catch((e) => console.log("I've found an error!", e));
					//currently planning to add retry thing
				} else bar.tick({ currVideos: k, totVideos: selectedVideos.length });
			}
			k++;
		}
		console.log(
			colors.green("\nSuccessfully downloaded %s"),
			selectedPlaylists[i].title?.text
		);
		// now comes merging and n-up imposing
	}
};

await main();
