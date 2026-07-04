import { App, Modal } from "obsidian";
import { TrialRecord } from "../types";

export class CompareModal extends Modal {
	constructor(app: App, private trials: TrialRecord[]) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "試作の比較" });

		const table = contentEl.createEl("table", { cls: "canele-compare-table" });
		const headerRow = table.createEl("tr");
		headerRow.createEl("th", { text: "項目" });
		for (const trial of this.trials) {
			headerRow.createEl("th", { text: trial.frontmatter.title || trial.frontmatter.id });
		}

		this.addRow(table, "日付", (t) => t.frontmatter.date);
		this.addRow(table, "評価", (t) => "★".repeat(t.frontmatter.rating));
		this.addRow(table, "焼成温度", (t) =>
			t.frontmatter.bake_temp_c != null ? `${t.frontmatter.bake_temp_c}℃` : "-"
		);
		this.addRow(table, "焼成時間", (t) =>
			t.frontmatter.bake_time_min != null ? `${t.frontmatter.bake_time_min}分` : "-"
		);
		this.addRow(table, "材料配合", (t) =>
			t.frontmatter.ingredients
				.map((i) => `${i.name} ${i.amount}${i.unit}`)
				.join("\n")
		);
		this.addRow(table, "タグ", (t) => t.frontmatter.tags.join(", "));
		this.addRow(table, "複製元", (t) => t.frontmatter.based_on ?? "-");
		this.addRow(table, "メモ", (t) => t.body);
	}

	private addRow(
		table: HTMLTableElement,
		label: string,
		accessor: (t: TrialRecord) => string
	) {
		const row = table.createEl("tr");
		row.createEl("td", { text: label });
		for (const trial of this.trials) {
			const cell = row.createEl("td");
			cell.style.whiteSpace = "pre-wrap";
			cell.setText(accessor(trial));
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
