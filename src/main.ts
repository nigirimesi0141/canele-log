import { Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { CaneleLogSettingTab } from "./settings";
import { CaneleLogSettings, DEFAULT_SETTINGS, TrialRecord, defaultFrontmatter } from "./types";
import { VaultStore } from "./vaultStore";
import { TrialListView, VIEW_TYPE_TRIAL_LIST } from "./views/TrialListView";
import { TrialModal, TrialModalResult } from "./views/TrialModal";
import { CompareModal } from "./views/CompareModal";
import { ExtractedRecipe, extractRecipeFromImage } from "./recipeExtractor";

export default class CaneleLogPlugin extends Plugin {
	settings: CaneleLogSettings = DEFAULT_SETTINGS;
	store!: VaultStore;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.store = new VaultStore(this.app, () => this.settings);

		this.registerView(VIEW_TYPE_TRIAL_LIST, (leaf) => new TrialListView(leaf, this));

		this.addRibbonIcon("chef-hat", "料理を記録", () => this.openCreateTrialModal());

		this.addCommand({
			id: "canele-log-new-trial",
			name: "新しい記録を作成",
			callback: () => this.openCreateTrialModal(),
		});

		this.addCommand({
			id: "canele-log-open-list",
			name: "料理ログ一覧を開く",
			callback: () => this.activateListView(),
		});

		this.addSettingTab(new CaneleLogSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_TRIAL_LIST).forEach((leaf) => leaf.detach());
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async activateListView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TRIAL_LIST);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf: WorkspaceLeaf | null = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: VIEW_TYPE_TRIAL_LIST, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	private async collectCategories(): Promise<string[]> {
		const used = await this.store.collectAllCategories();
		return Array.from(new Set([...this.settings.categories, ...used]))
			.filter((c) => c)
			.sort();
	}

	// APIキーが設定されているときだけ画像読み取り関数を返す（未設定なら機能を隠す）
	private buildExtractImage(): ((file: File) => Promise<ExtractedRecipe>) | null {
		const key = this.settings.anthropicApiKey?.trim();
		if (!key) return null;
		const model = this.settings.visionModel || DEFAULT_SETTINGS.visionModel;
		return async (file: File) => {
			const categories = await this.collectCategories();
			return extractRecipeFromImage(key, model, file, categories);
		};
	}

	async openCreateTrialModal(): Promise<void> {
		const allTags = await this.store.collectAllTags();
		const allCategories = await this.collectCategories();
		new TrialModal(
			this.app,
			defaultFrontmatter(this.settings.defaultCategory),
			"",
			null,
			allTags,
			allCategories,
			this.buildExtractImage(),
			(result) => this.handleModalSubmit(result, null)
		).open();
	}

	async openEditTrialModal(record: TrialRecord, file: TFile): Promise<void> {
		const allTags = await this.store.collectAllTags();
		const allCategories = await this.collectCategories();
		new TrialModal(
			this.app,
			record.frontmatter,
			record.body,
			file,
			allTags,
			allCategories,
			this.buildExtractImage(),
			(result) => this.handleModalSubmit(result, file)
		).open();
	}

	async openDuplicateTrialModal(record: TrialRecord): Promise<void> {
		const draft = await this.store.duplicateTrial(record);
		const allTags = await this.store.collectAllTags();
		const allCategories = await this.collectCategories();
		new TrialModal(this.app, draft, "", null, allTags, allCategories, this.buildExtractImage(), (result) =>
			this.handleModalSubmit(result, null)
		).open();
	}

	openCompareModal(records: TrialRecord[]): void {
		new CompareModal(this.app, records).open();
	}

	private async handleModalSubmit(
		result: TrialModalResult,
		existingFile: TFile | null
	): Promise<void> {
		const frontmatter = result.frontmatter;

		for (const path of result.removedPhotoPaths) {
			const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
			if (file instanceof TFile) await this.app.vault.delete(file).catch(() => undefined);
		}

		let nextIndex = frontmatter.photos.length + 1;
		for (const photo of result.newPhotos) {
			const path = await this.store.savePhoto(frontmatter.id, photo, nextIndex);
			frontmatter.photos.push(path);
			nextIndex++;
		}

		if (existingFile) {
			await this.store.updateTrial(existingFile, frontmatter, result.body);
			new Notice("試作記録を更新しました");
		} else {
			await this.store.createTrial(frontmatter, result.body);
			new Notice("試作記録を保存しました");
		}

		this.refreshListViews();
	}

	private refreshListViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TRIAL_LIST)) {
			const view = leaf.view;
			if (view instanceof TrialListView) view.refresh();
		}
	}
}
