import { App, TFile, TFolder, normalizePath } from "obsidian";
import {
	BASE_TAG,
	CaneleLogSettings,
	Ingredient,
	TrialFrontmatter,
	TrialRecord,
	defaultFrontmatter,
	formatId,
} from "./types";

const DEFAULT_BODY = "## メモ\n\n";

export class VaultStore {
	constructor(private app: App, private getSettings: () => CaneleLogSettings) {}

	private get trialsFolder(): string {
		return normalizePath(this.getSettings().trialsFolder);
	}

	private get attachmentsFolder(): string {
		return normalizePath(this.getSettings().attachmentsFolder);
	}

	async ensureFolders(): Promise<void> {
		await this.ensureFolder(this.trialsFolder);
		await this.ensureFolder(this.attachmentsFolder);
	}

	private async ensureFolder(path: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) return;
		await this.app.vault.createFolder(path).catch(() => {
			/* already exists */
		});
	}

	async listTrials(): Promise<TrialRecord[]> {
		await this.ensureFolders();
		const folder = this.app.vault.getAbstractFileByPath(this.trialsFolder);
		if (!(folder instanceof TFolder)) return [];

		const records: TrialRecord[] = [];
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const record = await this.readTrial(child);
			if (record) records.push(record);
		}
		records.sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date));
		return records;
	}

	async readTrial(file: TFile): Promise<TrialRecord | null> {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (!fm || !fm.id) return null;

		const frontmatter: TrialFrontmatter = {
			id: fm.id,
			title: fm.title ?? file.basename,
			date: fm.date ?? "",
			rating: fm.rating ?? 0,
			based_on: fm.based_on ?? null,
			bake_temp_c: fm.bake_temp_c ?? null,
			bake_time_min: fm.bake_time_min ?? null,
			ingredients: Array.isArray(fm.ingredients) ? fm.ingredients : [],
			photos: Array.isArray(fm.photos) ? fm.photos : [],
			tags: Array.isArray(fm.tags) ? fm.tags : [],
		};

		const content = await this.app.vault.read(file);
		const body = stripFrontmatter(content);

		return { frontmatter, body, path: file.path };
	}

	async collectAllTags(): Promise<string[]> {
		const trials = await this.listTrials();
		const tags = new Set<string>();
		for (const t of trials) {
			for (const tag of t.frontmatter.tags) tags.add(tag);
		}
		return Array.from(tags).sort();
	}

	async createTrial(
		frontmatter: TrialFrontmatter,
		body: string
	): Promise<TFile> {
		await this.ensureFolders();
		const path = normalizePath(`${this.trialsFolder}/${frontmatter.id}.md`);
		const initialContent = `---\n---\n\n${body || DEFAULT_BODY}`;
		const file = await this.app.vault.create(path, initialContent);
		await this.writeFrontmatter(file, frontmatter);
		return file;
	}

	async updateTrial(
		file: TFile,
		frontmatter: TrialFrontmatter,
		body: string
	): Promise<void> {
		const content = await this.app.vault.read(file);
		const fmBlock = extractFrontmatterBlock(content);
		await this.app.vault.modify(file, `${fmBlock}\n${body}`);
		await this.writeFrontmatter(file, frontmatter);
	}

	async deleteTrial(file: TFile, record: TrialRecord): Promise<void> {
		for (const photoPath of record.frontmatter.photos) {
			const photo = this.app.vault.getAbstractFileByPath(normalizePath(photoPath));
			if (photo instanceof TFile) {
				await this.app.vault.delete(photo).catch(() => undefined);
			}
		}
		await this.app.vault.delete(file);
	}

	async duplicateTrial(source: TrialRecord): Promise<TrialFrontmatter> {
		const next = defaultFrontmatter();
		return {
			...next,
			title: `${source.frontmatter.title} (複製)`,
			based_on: source.frontmatter.id,
			bake_temp_c: source.frontmatter.bake_temp_c,
			bake_time_min: source.frontmatter.bake_time_min,
			ingredients: source.frontmatter.ingredients.map((i: Ingredient) => ({ ...i })),
			tags: [...source.frontmatter.tags],
			photos: [],
		};
	}

	async savePhoto(trialId: string, file: File, index: number): Promise<string> {
		await this.ensureFolders();
		const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
		const path = normalizePath(`${this.attachmentsFolder}/${trialId}-${index}.${ext}`);
		const buffer = await file.arrayBuffer();
		await this.app.vault.createBinary(path, buffer);
		return path;
	}

	private async writeFrontmatter(file: TFile, frontmatter: TrialFrontmatter): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.id = frontmatter.id;
			fm.title = frontmatter.title;
			fm.date = frontmatter.date;
			fm.rating = frontmatter.rating;
			fm.based_on = frontmatter.based_on;
			fm.bake_temp_c = frontmatter.bake_temp_c;
			fm.bake_time_min = frontmatter.bake_time_min;
			fm.ingredients = frontmatter.ingredients;
			fm.photos = frontmatter.photos;
			fm.tags = Array.from(new Set([BASE_TAG, ...frontmatter.tags]));
		});
	}
}

function extractFrontmatterBlock(content: string): string {
	const match = content.match(/^---\n[\s\S]*?\n---/);
	return match ? match[0] : "---\n---";
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---\n[\s\S]*?\n---\n?/, "").trimStart();
}

export function newTrialId(): string {
	return formatId(new Date());
}
