import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type CaneleLogPlugin from "../main";
import { TrialRecord } from "../types";

export const VIEW_TYPE_TRIAL_LIST = "canele-log-trial-list";

type SortKey = "date-desc" | "date-asc" | "rating-desc" | "rating-asc";

export class TrialListView extends ItemView {
	private records: TrialRecord[] = [];
	private categoryFilter = "";
	private tagFilter = "";
	private sortKey: SortKey = "date-desc";
	private selected = new Set<string>();

	constructor(leaf: WorkspaceLeaf, private plugin: CaneleLogPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_TRIAL_LIST;
	}

	getDisplayText(): string {
		return "料理ログ";
	}

	getIcon(): string {
		return "list";
	}

	async onOpen(): Promise<void> {
		await this.refresh();
	}

	async refresh(): Promise<void> {
		this.records = await this.plugin.store.listTrials();
		this.render();
	}

	private getFile(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	private visibleRecords(): TrialRecord[] {
		let list = this.records;
		if (this.categoryFilter) {
			list = list.filter((r) => r.frontmatter.category === this.categoryFilter);
		}
		if (this.tagFilter) {
			list = list.filter((r) => r.frontmatter.tags.includes(this.tagFilter));
		}
		const sorted = [...list];
		switch (this.sortKey) {
			case "date-desc":
				sorted.sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date));
				break;
			case "date-asc":
				sorted.sort((a, b) => a.frontmatter.date.localeCompare(b.frontmatter.date));
				break;
			case "rating-desc":
				sorted.sort((a, b) => b.frontmatter.rating - a.frontmatter.rating);
				break;
			case "rating-asc":
				sorted.sort((a, b) => a.frontmatter.rating - b.frontmatter.rating);
				break;
		}
		return sorted;
	}

	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("canele-log-list");

		const header = container.createDiv();
		header.createEl("h4", { text: "料理ログ" });
		const newBtn = header.createEl("button", { text: "＋ 新規記録" });
		newBtn.onclick = () => this.plugin.openCreateTrialModal();

		const filterBar = container.createDiv({ cls: "canele-filter-bar" });

		const categorySelect = filterBar.createEl("select");
		categorySelect.createEl("option", { text: "すべてのカテゴリ", value: "" });
		const allCategories = Array.from(
			new Set(this.records.map((r) => r.frontmatter.category).filter((c) => c))
		).sort();
		for (const cat of allCategories) categorySelect.createEl("option", { text: cat, value: cat });
		categorySelect.value = this.categoryFilter;
		categorySelect.onchange = () => {
			this.categoryFilter = categorySelect.value;
			this.render();
		};

		const tagSelect = filterBar.createEl("select");
		tagSelect.createEl("option", { text: "すべてのタグ", value: "" });
		const allTags = Array.from(new Set(this.records.flatMap((r) => r.frontmatter.tags))).sort();
		for (const tag of allTags) tagSelect.createEl("option", { text: tag, value: tag });
		tagSelect.value = this.tagFilter;
		tagSelect.onchange = () => {
			this.tagFilter = tagSelect.value;
			this.render();
		};

		const sortSelect = filterBar.createEl("select");
		const sortOptions: [SortKey, string][] = [
			["date-desc", "日付が新しい順"],
			["date-asc", "日付が古い順"],
			["rating-desc", "評価が高い順"],
			["rating-asc", "評価が低い順"],
		];
		for (const [value, label] of sortOptions) sortSelect.createEl("option", { text: label, value });
		sortSelect.value = this.sortKey;
		sortSelect.onchange = () => {
			this.sortKey = sortSelect.value as SortKey;
			this.render();
		};

		const compareBtn = filterBar.createEl("button", { text: "選択を比較" });
		compareBtn.onclick = () => {
			const chosen = this.records.filter((r) => this.selected.has(r.frontmatter.id));
			if (chosen.length >= 2) this.plugin.openCompareModal(chosen);
		};

		const list = container.createDiv();
		for (const record of this.visibleRecords()) {
			const row = list.createDiv({ cls: "canele-trial-row" });

			const checkbox = row.createEl("input", { type: "checkbox" });
			checkbox.checked = this.selected.has(record.frontmatter.id);
			checkbox.onchange = () => {
				if (checkbox.checked) this.selected.add(record.frontmatter.id);
				else this.selected.delete(record.frontmatter.id);
			};

			const info = row.createDiv();
			const title = info.createDiv({
				cls: "canele-trial-title",
				text: `${record.frontmatter.title || "(無題)"} ${"★".repeat(record.frontmatter.rating)}`,
			});
			title.onclick = () => {
				const file = this.getFile(record.path);
				if (file) this.app.workspace.getLeaf(false).openFile(file);
			};
			info.createDiv({
				text: [
					record.frontmatter.date,
					record.frontmatter.category,
					record.frontmatter.tags.join(", "),
				]
					.filter((s) => s)
					.join(" / "),
			});

			const actions = row.createDiv({ cls: "canele-trial-actions" });
			const editBtn = actions.createEl("button", { text: "編集" });
			editBtn.onclick = () => {
				const file = this.getFile(record.path);
				if (file) this.plugin.openEditTrialModal(record, file);
			};
			const dupBtn = actions.createEl("button", { text: "複製" });
			dupBtn.onclick = () => this.plugin.openDuplicateTrialModal(record);
			const delBtn = actions.createEl("button", { text: "削除" });
			delBtn.onclick = async () => {
				const file = this.getFile(record.path);
				if (!file) return;
				await this.plugin.store.deleteTrial(file, record);
				await this.refresh();
			};
		}
	}
}
