import { App, TFile, TFolder, normalizePath } from "obsidian";
import {
	BakeStep,
	CaneleLogSettings,
	Ingredient,
	TrialFrontmatter,
	TrialRecord,
	defaultFrontmatter,
	formatId,
} from "./types";

const DEFAULT_BODY = "## メモ\n\n";
// 材料・工程は記録データから本文に自動生成する。この区切りより下がユーザーの自由メモ。
const AUTO_START = "%% canele-log:auto-start %%";
const AUTO_END = "%% canele-log:auto-end %%";

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
			category: typeof fm.category === "string" ? fm.category : "",
			rating: fm.rating ?? 0,
			based_on: fm.based_on ?? null,
			steps: readSteps(fm),
			ingredients: Array.isArray(fm.ingredients) ? fm.ingredients : [],
			photos: Array.isArray(fm.photos) ? fm.photos : [],
			tags: Array.isArray(fm.tags) ? fm.tags : [],
		};

		const content = await this.app.vault.read(file);
		const body = extractMemo(stripFrontmatter(content));

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

	async collectAllCategories(): Promise<string[]> {
		const trials = await this.listTrials();
		const categories = new Set<string>();
		for (const t of trials) {
			if (t.frontmatter.category) categories.add(t.frontmatter.category);
		}
		return Array.from(categories).sort();
	}

	async createTrial(
		frontmatter: TrialFrontmatter,
		body: string
	): Promise<TFile> {
		await this.ensureFolders();
		const path = normalizePath(`${this.trialsFolder}/${frontmatter.id}.md`);
		const initialContent = `---\n---\n\n${buildNoteBody(frontmatter, body)}`;
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
		await this.app.vault.modify(file, `${fmBlock}\n\n${buildNoteBody(frontmatter, body)}`);
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
			category: source.frontmatter.category,
			based_on: source.frontmatter.id,
			steps: source.frontmatter.steps.map((s: BakeStep) => ({ ...s })),
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
			fm.category = frontmatter.category;
			fm.rating = frontmatter.rating;
			fm.based_on = frontmatter.based_on;
			fm.steps = frontmatter.steps;
			delete fm.bake_temp_c;
			delete fm.bake_time_min;
			fm.ingredients = frontmatter.ingredients;
			fm.photos = frontmatter.photos;
			fm.tags = Array.from(new Set(frontmatter.tags));
		});
	}
}

function readSteps(fm: Record<string, unknown>): BakeStep[] {
	const toNum = (v: unknown): number | null =>
		v === null || v === undefined || v === "" ? null : Number(v);

	if (Array.isArray(fm.steps)) {
		return fm.steps.map((s: Record<string, unknown>) => ({
			label: typeof s?.label === "string" ? s.label : "",
			temp_c: toNum(s?.temp_c),
			time_min: toNum(s?.time_min),
		}));
	}

	// 旧フォーマット（単一の焼成温度/時間）を1工程へ移行
	const legacyTemp = toNum(fm.bake_temp_c);
	const legacyTime = toNum(fm.bake_time_min);
	if (legacyTemp !== null || legacyTime !== null) {
		return [{ label: "", temp_c: legacyTemp, time_min: legacyTime }];
	}

	return [];
}

function extractFrontmatterBlock(content: string): string {
	const match = content.match(/^---\n[\s\S]*?\n---/);
	return match ? match[0] : "---\n---";
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---\n[\s\S]*?\n---\n?/, "").trimStart();
}

// ノート本文から、ユーザーの自由メモ部分だけを取り出す（自動生成ブロックを除く）
function extractMemo(body: string): string {
	const endIdx = body.indexOf(AUTO_END);
	if (endIdx === -1) return body.trim();
	return body.slice(endIdx + AUTO_END.length).trim();
}

// ノート本文 = 材料/工程の自動生成ブロック + ユーザーの自由メモ
function buildNoteBody(fm: TrialFrontmatter, memo: string): string {
	const memoText = memo && memo.trim() ? memo.trim() : DEFAULT_BODY.trim();
	const summary = renderSummary(fm);
	if (!summary) return `${memoText}\n`;
	return `${AUTO_START}\n${summary}\n${AUTO_END}\n\n${memoText}\n`;
}

function renderSummary(fm: TrialFrontmatter): string {
	const lines: string[] = [];

	if (fm.photos.length) {
		lines.push("## 写真", "");
		for (const p of fm.photos) lines.push(`![[${p}|400]]`);
		lines.push("");
	}

	if (fm.ingredients.length) {
		lines.push("## 材料", "", "| 材料 | 分量 |", "| --- | --- |");
		for (const ing of fm.ingredients) {
			lines.push(`| ${ing.name || ""} | ${formatAmount(ing)} |`);
		}
		lines.push("");
	}

	if (fm.steps.length) {
		lines.push("## 調理工程", "");
		fm.steps.forEach((s, i) => lines.push(`${i + 1}. ${formatStepLine(s)}`));
		lines.push("");
	}

	return lines.join("\n").trim();
}

function formatAmount(ing: Ingredient): string {
	const amt = ing.amount ? String(ing.amount) : "";
	const text = `${amt}${ing.unit ?? ""}`.trim();
	return text || "-";
}

function formatStepLine(step: BakeStep): string {
	const parts: string[] = [];
	if (step.temp_c != null) parts.push(`${step.temp_c}℃`);
	if (step.time_min != null) parts.push(`${step.time_min}分`);
	const cond = parts.join(" / ");
	if (step.label && cond) return `${step.label}（${cond}）`;
	return step.label || cond || "-";
}

export function newTrialId(): string {
	return formatId(new Date());
}
