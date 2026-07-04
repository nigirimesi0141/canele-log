import { App, Modal } from "obsidian";
import { BakeStep, TrialRecord } from "../types";

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
		this.addRow(table, "焼成工程", (t) =>
			t.frontmatter.steps.length
				? t.frontmatter.steps.map((s, i) => `${i + 1}. ${formatStep(s)}`).join("\n")
				: "-"
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

function formatStep(step: BakeStep): string {
	const parts: string[] = [];
	if (step.temp_c != null) parts.push(`${step.temp_c}℃`);
	if (step.time_min != null) parts.push(`${step.time_min}分`);
	const cond = parts.join(" / ");
	if (step.label && cond) return `${step.label}（${cond}）`;
	return step.label || cond || "-";
}
